package web

import (
	"embed"
	"io/fs"
)

//go:embed index.html enroll.html app.js attempts.js enroll.js passkey.js keys.js keybar.js keyboard.js spring.js presence.js press.js status.js manifest.webmanifest style.css theme.js icons vendor
var files embed.FS

func Files() fs.FS { return files }
