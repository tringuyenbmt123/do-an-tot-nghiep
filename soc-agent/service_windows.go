//go:build windows
// +build windows

package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

const serviceName = "SOCAgent"
const serviceDisplayName = "SOC/EDR Endpoint Agent"
const serviceDesc = "Unified SOC/EDR Endpoint Detection & Response Agent"

type agentService struct {
	startFunc func()
	stopFunc  func()
}

func (m *agentService) Execute(args []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (ssec bool, errno uint32) {
	const cmdsAccepted = svc.AcceptStop | svc.AcceptShutdown
	changes <- svc.Status{State: svc.StartPending}
	changes <- svc.Status{State: svc.Running, Accepts: cmdsAccepted}

	go m.startFunc()

	for req := range r {
		switch req.Cmd {
		case svc.Interrogate:
			changes <- req.CurrentStatus
		case svc.Stop, svc.Shutdown:
			changes <- svc.Status{State: svc.StopPending}
			m.stopFunc()
			changes <- svc.Status{State: svc.Stopped}
			return false, 0
		}
	}
	return false, 0
}

func isWindowsService() (bool, error) {
	return svc.IsWindowsService()
}

func runAsWindowsService(startFunc func(), stopFunc func()) error {
	return svc.Run(serviceName, &agentService{
		startFunc: startFunc,
		stopFunc:  stopFunc,
	})
}

func installService() error {
	exePath, err := os.Executable()
	if err != nil {
		return err
	}
	exePath, err = filepath.Abs(exePath)
	if err != nil {
		return err
	}

	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("không thể kết nối Windows Service Control Manager (cần chạy với quyền Administrator): %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(serviceName)
	if err == nil {
		s.Close()
		return fmt.Errorf("service '%s' đã tồn tại trong hệ thống", serviceName)
	}

	s, err = m.CreateService(serviceName, exePath, mgr.Config{
		DisplayName:      serviceDisplayName,
		Description:      serviceDesc,
		StartType:        mgr.StartAutomatic, // Tự động khởi chạy cùng Windows (Auto-Start)
		DelayedAutoStart: true,               // Chờ mạng (Network) và Windows khởi động hoàn toàn mới bật
	})
	if err != nil {
		return fmt.Errorf("không thể tạo service: %w", err)
	}
	defer s.Close()

	// Thiết lập tự động khởi động lại (Auto Recovery) nếu service bị tắt bất ngờ
	recoveryActions := []mgr.RecoveryAction{
		{Type: mgr.ServiceRestart, Delay: 5000},  // Thử lại sau 5s
		{Type: mgr.ServiceRestart, Delay: 10000}, // Thử lại sau 10s
		{Type: mgr.ServiceRestart, Delay: 30000}, // Thử lại sau 30s
	}
	_ = s.SetRecoveryActions(recoveryActions, 86400)

	log.Printf("[SERVICE] ✅ Đã đăng ký thành công Windows Service '%s' (Delayed Auto-Start & Auto Recovery)", serviceName)
	return nil
}

func uninstallService() error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()

	s, err := m.OpenService(serviceName)
	if err != nil {
		return fmt.Errorf("service '%s' không tồn tại", serviceName)
	}
	defer s.Close()

	// Dừng service trước khi xóa nếu đang chạy
	s.Control(svc.Stop)

	err = s.Delete()
	if err != nil {
		return fmt.Errorf("không thể xóa service: %w", err)
	}

	log.Printf("[SERVICE] ✅ Đã xóa Windows Service '%s' khỏi hệ thống", serviceName)
	return nil
}

func startService() error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()

	s, err := m.OpenService(serviceName)
	if err != nil {
		return fmt.Errorf("service '%s' không tồn tại", serviceName)
	}
	defer s.Close()

	err = s.Start()
	if err != nil {
		return fmt.Errorf("không thể khởi động service: %w", err)
	}

	log.Printf("[SERVICE] ✅ Đã khởi động Windows Service '%s'", serviceName)
	return nil
}

func stopService() error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()

	s, err := m.OpenService(serviceName)
	if err != nil {
		return fmt.Errorf("service '%s' không tồn tại", serviceName)
	}
	defer s.Close()

	_, err = s.Control(svc.Stop)
	if err != nil {
		return fmt.Errorf("không thể dừng service: %w", err)
	}

	log.Printf("[SERVICE] 🛑 Đã dừng Windows Service '%s'", serviceName)
	return nil
}
