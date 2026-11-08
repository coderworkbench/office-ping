#!/bin/bash
# Office Ping: open automatically when you log in to Linux (GNOME, KDE,
# Xfce, Cinnamon, MATE and other desktops that follow the XDG autostart spec).
#
#   Run:   curl -fsSL https://<your-site>/autostart/linux.sh | OFFICE_PING_URL=https://<your-site> bash
#   Undo:  curl -fsSL https://<your-site>/autostart/linux.sh | bash -s -- --remove
#
# It adds ~/.config/autostart/office-ping.desktop, which opens Office Ping in
# its own Chrome / Chromium / Edge / Brave window each time you log in, plus an
# "Office Ping" entry in your app menu, and opens it now. No sudo needed.
set -euo pipefail

AUTOSTART="$HOME/.config/autostart/office-ping.desktop"
MENU="$HOME/.local/share/applications/office-ping.desktop"
ICON="$HOME/.local/share/icons/office-ping.png"

if [ "${1:-}" = "--remove" ]; then
  rm -f "$AUTOSTART" "$MENU" "$ICON"
  echo "Done. Office Ping will no longer open when you log in."
  exit 0
fi

# The site's address comes from OFFICE_PING_URL (the Help page's command sets
# it); ask for it when run by hand in a terminal.
URL="${OFFICE_PING_URL:-}"
if [ -z "$URL" ] && [ -t 0 ]; then
  read -r -p "Office Ping address (what you type in the browser, e.g. https://ping.example.com): " URL
fi
URL="${URL%/}"
case "$URL" in
  http://*|https://*) ;;
  *) echo "Please run this again with the site's address, e.g.: OFFICE_PING_URL=https://ping.example.com bash linux.sh"; exit 1 ;;
esac

BROWSER=""
for b in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge microsoft-edge-stable brave-browser; do
  if command -v "$b" >/dev/null 2>&1; then BROWSER="$(command -v "$b")"; break; fi
done
if [ -z "$BROWSER" ]; then
  echo "Google Chrome, Chromium or Microsoft Edge is needed. Install one of them, then run this again."
  exit 1
fi

mkdir -p "$(dirname "$AUTOSTART")" "$(dirname "$MENU")" "$(dirname "$ICON")"
curl -fsSL "$URL/icons/icon-192.png" -o "$ICON" 2>/dev/null || ICON="$BROWSER"

entry() {
  cat <<DESKTOP
[Desktop Entry]
Type=Application
Name=Office Ping
Comment=Office pings: a tap on the shoulder from your colleagues
Exec="$BROWSER" --app=$URL/dashboard
Icon=$ICON
Terminal=false
Categories=Network;
DESKTOP
}
entry > "$MENU"
{ entry; echo "X-GNOME-Autostart-enabled=true"; echo "X-GNOME-Autostart-Delay=5"; } > "$AUTOSTART"
chmod +x "$MENU" "$AUTOSTART"

nohup "$BROWSER" --app="$URL/dashboard" >/dev/null 2>&1 &

echo "Done. Office Ping will open by itself each time you log in,"
echo "and it's in your app menu as \"Office Ping\"."
echo "Keep its window open (minimise it, don't close it) so pings can reach you."
