package web

import (
	"embed"
	"io/fs"
)

//go:embed index.html enroll.html app.js attempts.js enroll.js passkey.js keys.js sessions.js switcher.js keybar.js dock.js keyboard.js mouse.js stepper.js momentum.js gesture.js touch.js focus.js repeat.js spring.js presence.js press.js status.js manifest.webmanifest style.css theme.js icons vendor
var files embed.FS

func Files() fs.FS { return files }
