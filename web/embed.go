package web

import (
	"embed"
	"io/fs"
)

//go:embed index.html enroll.html dom.js narrow.js app.js attempts.js enroll.js base64url.js passkey.js notifications.js pushplatform.js sw.js keys.js sessions.js toggle.js switcher.js keybar.js flick.js flickmenu.js dock.js reposition.js pilllayout.js keyboard.js dictation.js mouse.js stepper.js momentum.js gesture.js touch.js focus.js repeat.js spring.js presence.js press.js status.js manifest.webmanifest style.css theme.js icons vendor
var files embed.FS

func Files() fs.FS { return files }
