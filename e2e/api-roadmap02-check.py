#!/usr/bin/env python3
"""Roadmap-02 live check with the test account (~/kalorientracker/.env.claude.local).

Calls the deployed API through fitnesstracker-caddy:8080 (kcal host) from a throwaway curl container.
Prints an allowlist only: status codes, counts, food names from the shared BLS/OFF data, numbers.
Never prints tokens, cookies, the email address or the password. Removes what it creates.
"""
import json, os, re, subprocess, uuid, datetime

ENV_FILE = os.path.expanduser("~/kalorientracker/.env.claude.local")
BASE = "http://fitnesstracker-caddy:8080/api"
HOST = "kcal.pwa-tree.de"


def read_env():
    values = {}
    for line in open(ENV_FILE):
        m = re.match(r"^\s*([A-Z_]+)\s*[:=]\s*(.*?)\s*$", line)
        if m:
            values[m.group(1)] = m.group(2).strip('"').strip("'")
    return values


def call(method, path, token=None, body=None, cookie=None, raw_body=False):
    args = ["docker", "run", "--rm", "-i", "--network", "fitnesstracker_default", "curlimages/curl:latest",
            "-s", "-D", "-", "-X", method, "-H", f"Host: {HOST}"]
    if token:
        args += ["-H", "Authorization: Bearer " + token]
    if cookie:
        args += ["-H", f"Cookie: refreshToken={cookie}"]
    if body is not None:
        args += ["-H", "Content-Type: application/json", "--data-binary", "@-"]
    args.append(BASE + path)
    out = subprocess.run(args, input=(json.dumps(body).encode() if body is not None else b""), capture_output=True).stdout
    head, sep, payload = out.partition(b"\r\n\r\n")
    if not sep:
        raise SystemExit("unexpected response format; aborting without printing it")
    lines = head.decode("latin-1").split("\r\n")
    status = int(lines[0].split()[1])
    headers = {l.split(":", 1)[0].lower(): l.split(":", 1)[1].strip() for l in lines[1:] if ":" in l}
    cookies = [l.split(":", 1)[1].strip() for l in lines[1:] if l.lower().startswith("set-cookie:")]
    if raw_body:
        return status, headers, payload, cookies
    try:
        data = json.loads(payload) if payload.strip() else None
    except ValueError:
        data = None
    return status, headers, data, cookies


env = read_env()
st, _, data, cookies = call("POST", "/auth/login", body={"email": env["TEST_PWA_EMAIL"], "password": env["TEST_PWA_PASSWORD"]})
token = data.get("accessToken") if isinstance(data, dict) else None
refresh = None
for c in cookies:
    m = re.match(r"refreshToken=([^;]+)", c)
    if m and m.group(1):
        refresh = m.group(1)
print("Login:", st, "| accessToken:", bool(token))
if not token:
    raise SystemExit(1)

for q in ["Haferflocken", "Brokoli", "Olivenoel", "Ei", "Nudeln", "Hühnerbrust"]:
    st, _, data, _ = call("GET", "/nutrition/foods/search?q=" + q.replace("ü", "%C3%BC"), token)
    items = data.get("items", []) if isinstance(data, dict) else []
    top = [f'{i["name"]} [{i["source"]}]' for i in items[:3] if i.get("source") in ("BLS", "OFF")]
    attr = bool(items and items[0].get("attribution"))
    print(f"Suche {q!r}: {st} | {len(items)} Treffer | Quelle angegeben: {attr} | Top: {top}")

st, _, data, _ = call("GET", "/nutrition/targets/today", token)
if isinstance(data, dict):
    t = data.get("targets") if "targets" in data else data
    shape = sorted(t.keys()) if isinstance(t, dict) else t
    print("Ziele heute:", st, "| Felder:", shape)
else:
    print("Ziele heute:", st)

st, _, data, _ = call("GET", "/nutrition/foods/barcode/3017620422003", token)
print("Barcode (OFF):", st, "|", (data.get("name"), data.get("source"), (data.get("per100") or {}).get("kcal"), bool(data.get("attribution"))) if st == 200 and isinstance(data, dict) else "")

# Snapshot check: own food -> meal -> change food -> the meal keeps its values. Cleaned up afterwards.
now = datetime.datetime.now(datetime.timezone.utc)
iso = lambda s: (now + datetime.timedelta(seconds=s)).isoformat().replace("+00:00", "Z")
food_id, meal_id, entry_id = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
st, _, data, _ = call("PUT", f"/nutrition/foods/{food_id}", token, {"name": "Live-Check Testquark (Claude)", "kcal": 67, "proteinG": 12, "carbsG": 4, "fatG": 0.2, "clientUpdatedAt": iso(0)})
print("Eigenes Lebensmittel anlegen:", st)
st, _, data, _ = call("POST", "/nutrition/meals", token, {"id": meal_id, "date": now.date().isoformat(), "mealType": "SNACK", "entries": [{"id": entry_id, "foodId": food_id, "quantity": 250, "unitLabel": "g"}]})
e = (data or {}).get("entries", [{}])[0] if isinstance(data, dict) else {}
print("Mahlzeit loggen:", st, "| kcal:", e.get("nutrients", {}).get("kcal"), "| Protein:", e.get("nutrients", {}).get("proteinG"))
st, _, _, _ = call("PUT", f"/nutrition/foods/{food_id}", token, {"name": "Live-Check Testquark (Claude)", "kcal": 999, "proteinG": 1, "clientUpdatedAt": iso(1)})
print("Lebensmittel ändern:", st)
st, _, data, _ = call("GET", f"/nutrition/meals?from={now.date().isoformat()}&to={now.date().isoformat()}", token)
logs = data.get("items", data) if isinstance(data, (dict, list)) else []
logs = logs if isinstance(logs, list) else []
mine = [l for l in logs if l.get("id") == meal_id]
e2 = mine[0]["entries"][0] if mine and mine[0].get("entries") else {}
print("Mahlzeit danach:", st, "| kcal:", e2.get("nutrients", {}).get("kcal"), "| Protein:", e2.get("nutrients", {}).get("proteinG"))

st, _, data, _ = call("POST", "/nutrition/recipes/calculate", token, {"name": "Live-Check Rechnung", "servings": 2, "finalWeightG": 400, "ingredients": [{"foodId": food_id, "quantity": 500, "unitLabel": "g"}]})
if isinstance(data, dict):
    print("Rezept rechnen (ohne Speichern):", st, "| roh:", data.get("totalRawWeightG"), "| Änderung %:", data.get("cookingChangePercent"), "| pro 100 g kcal:", (data.get("per100g") or {}).get("kcal"))
else:
    print("Rezept rechnen:", st)

for fmt in ["csv", "md", "json", "pdf"]:
    st, h, body, _ = call("GET", f"/nutrition/export?days=7&format={fmt}", token, raw_body=True)
    print(f"Export {fmt}: {st} | {h.get('content-type', '').split(';')[0]} | {len(body)} Bytes | PDF-Signatur: {body[:4] == b'%PDF'}" if fmt == "pdf" else f"Export {fmt}: {st} | {h.get('content-type', '').split(';')[0]} | {len(body)} Bytes")

st1, _, _, _ = call("DELETE", f"/nutrition/meals/{meal_id}", token)
st2, _, _, _ = call("DELETE", f"/nutrition/foods/{food_id}", token)
print("Aufräumen: Mahlzeit", st1, "| Lebensmittel", st2)
if refresh:
    st, _, _, _ = call("POST", "/auth/logout", token, cookie=refresh)
    print("Logout:", st)
