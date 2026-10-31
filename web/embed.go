package web

import (
	"embed"
	"io/fs"
)

//go:embed index.html app.js style.css vendor
var files embed.FS

func Files() fs.FS { return files }
