package config

import (
	"fmt"
	"reflect"
	"sort"
	"strconv"
	"strings"
)

var ErrUnknownKey = fmt.Errorf("unknown setting")

func Keys() []string {
	fields := tomlFields(reflect.TypeOf(Config{}))
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func (c Config) Get(key string) (string, error) {
	idx, ok := tomlFields(reflect.TypeOf(c))[key]
	if !ok {
		return "", fmt.Errorf("%w %q (available: %s)", ErrUnknownKey, key, strings.Join(Keys(), ", "))
	}
	v := reflect.ValueOf(c).Field(idx)
	if v.Kind() == reflect.Int {
		return strconv.FormatInt(v.Int(), 10), nil
	}
	return v.String(), nil
}

func (c *Config) Set(key, value string) error {
	idx, ok := tomlFields(reflect.TypeOf(*c))[key]
	if !ok {
		return fmt.Errorf("%w %q (available: %s)", ErrUnknownKey, key, strings.Join(Keys(), ", "))
	}
	field := reflect.ValueOf(c).Elem().Field(idx)
	switch field.Kind() {
	case reflect.String:
		field.SetString(value)
	case reflect.Int:
		n, err := strconv.Atoi(value)
		if err != nil {
			return fmt.Errorf("%s must be a whole number: %w", key, err)
		}
		field.SetInt(int64(n))
	default:
		return fmt.Errorf("setting %q has an unsupported type", key)
	}
	return nil
}

func tomlFields(t reflect.Type) map[string]int {
	fields := make(map[string]int, t.NumField())
	for i := 0; i < t.NumField(); i++ {
		name, _, _ := strings.Cut(t.Field(i).Tag.Get("toml"), ",")
		if name != "" {
			fields[name] = i
		}
	}
	return fields
}
