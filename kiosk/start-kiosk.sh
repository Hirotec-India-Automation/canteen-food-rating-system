#!/bin/bash
# Launches Chromium in kiosk (full-screen, no UI chrome) mode for the
# canteen feedback touch display. Point KIOSK_URL at wherever FoodRating.html
# is hosted (a local file:// path, or the URL of your deployed site).

KIOSK_URL="${KIOSK_URL:-http://localhost/FoodRating.html}"

# Give the desktop/network a moment to come up on boot
sleep 5

# Prevent the display from blanking/sleeping
xset s off
xset s noblank
xset -dpms

# Hide the mouse cursor when idle (requires: sudo apt install unclutter)
unclutter -idle 0.5 -root &

CHROMIUM_BIN=$(command -v chromium-browser || command -v chromium)

exec "$CHROMIUM_BIN" \
  --kiosk \
  --incognito \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000 \
  --app="$KIOSK_URL"
