#!/bin/sh
# The whole live suite (Roadmaps 01–05), in the order a user meets the features.
exec "$(dirname "$0")/run.sh" sso-acceptance.mjs offline-day.mjs capture.mjs recipes-export.mjs mobile.mjs shortcuts.mjs
