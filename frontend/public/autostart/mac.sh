#!/bin/bash
# Office Ping: open automatically when you log in to your Mac.
#
#   Run (Terminal):  curl -fsSL https://<your-site>/autostart/mac.sh | OFFICE_PING_URL=https://<your-site> bash
#   Undo:            curl -fsSL https://<your-site>/autostart/mac.sh | bash -s -- --remove
#
# It adds a login item (a LaunchAgent in ~/Library/LaunchAgents) that opens
# Office Ping in its own Chrome or Edge window each time you log in, and opens
# it now. Nothing is installed and no administrator password is needed.
set -euo pipefail

LABEL="com.officeping.autostart"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ "${1:-}" = "--remove" ]; then
  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Done. Office Ping will no longer open when you log in."
  exit 0
fi

# The site's address comes from OFFICE_PING_URL (the Help page's command sets
# it); ask for it when run by hand in Terminal.
URL="${OFFICE_PING_URL:-}"
if [ -z "$URL" ] && [ -t 0 ]; then
  read -r -p "Office Ping address (what you type in the browser, e.g. https://ping.example.com): " URL
fi
URL="${URL%/}"
case "$URL" in
  http://*|https://*) ;;
  *) echo "Please run this again with the site's address, e.g.: OFFICE_PING_URL=https://ping.example.com bash mac.sh"; exit 1 ;;
esac

BIN=""
for app in "Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium"; do
  for dir in "/Applications" "$HOME/Applications"; do
    if [ -x "$dir/$app.app/Contents/MacOS/$app" ]; then BIN="$dir/$app.app/Contents/MacOS/$app"; break 2; fi
  done
done
if [ -z "$BIN" ]; then
  echo "Google Chrome or Microsoft Edge is needed. Install one of them, then run this again."
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$BIN</string>
    <string>--app=$URL/dashboard</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
PLIST

# Opens it now as well (RunAtLoad), and from now on at every login.
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load "$PLIST"

echo "Done. Office Ping will open by itself each time you log in."
echo "macOS may show a notice that a background item was added; that's this."
echo "Keep its window open (minimise it, don't quit it) so pings can reach you."
