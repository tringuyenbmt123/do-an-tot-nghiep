//go:build !windows
// +build !windows

package main

import "errors"

func isWindowsService() (bool, error) {
	return false, nil
}

func runAsWindowsService(startFunc func(), stopFunc func()) error {
	return errors.New("Windows Service chỉ hỗ trợ trên Windows OS")
}

func installService() error {
	return errors.New("Windows Service chỉ hỗ trợ trên Windows OS")
}

func uninstallService() error {
	return errors.New("Windows Service chỉ hỗ trợ trên Windows OS")
}

func startService() error {
	return errors.New("Windows Service chỉ hỗ trợ trên Windows OS")
}

func stopService() error {
	return errors.New("Windows Service chỉ hỗ trợ trên Windows OS")
}
