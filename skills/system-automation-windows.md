# Windows System Automation & OS Control Skill

This skill provides protocols and reliable PowerShell/Command patterns for automating Windows system tasks, managing services, inspecting running processes, modifying environment variables, managing network ports, and executing administrative automation safely.

## When to Use
- Managing Windows services, background jobs, and active processes.
- Inspecting listening ports, diagnosing port conflicts, and terminating orphaned processes.
- Querying and setting user/machine environment variables.
- Performing batch file operations, archive extractions, and script scheduling on Windows.

## Best Practices

### 1. Process & Port Inspection
- Check what process is listening on a specific port:
  ```powershell
  Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, OwningProcess
  ```
- Find and inspect processes cleanly without throwing errors:
  ```powershell
  Get-Process -Id <pid> -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, WorkingSet64
  ```

### 2. Environment Variables
- Read current process or user variables:
  ```powershell
  $env:MY_VAR
  [System.Environment]::GetEnvironmentVariable('PATH', 'User')
  ```

### 3. Service Lifecycle
- Query and restart local dev services safely:
  ```powershell
  Get-Service -Name "service_name" -ErrorAction SilentlyContinue
  ```

### 4. Non-Destructive File Operations
- Always use `-Force` with explicit paths; avoid wildcard deletions on system directories.
