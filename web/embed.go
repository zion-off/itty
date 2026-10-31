package web

import (
	"embed"
	"io/fs"
)

//go:embed index.html enroll.html app.js enroll.js passkey.js style.css vendor
var files embed.FS

func Files() fs.FS { return files }
