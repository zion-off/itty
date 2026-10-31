package clock

import "time"

type Clock interface {
	Now() time.Time
}

type System struct{}

func (System) Now() time.Time { return time.Now() }

type Fake struct{ T time.Time }

func (f *Fake) Now() time.Time          { return f.T }
func (f *Fake) Advance(d time.Duration) { f.T = f.T.Add(d) }
