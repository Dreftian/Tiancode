; ============================================================
; Tiancode — NSIS Dark Theme Installer (Windows 10 / 11)
; Solid Dark Theme palette (#181A20) with high contrast text (#F0F2F5)
; ============================================================

!include "LogicLib.nsh"
!include "WinVer.nsh"

; Definiciones de color para Modern UI 2 (MUI2)
!define MUI_BGCOLOR "181A20"
!define MUI_TEXTCOLOR "F0F2F5"
!define MUI_HEADER_TRANSPARENT_TEXT
!define MUI_INSTFILESPAGE_COLORS "0xF0F2F5 0x181A20"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"

!ifndef BUILD_UNINSTALLER
  !define MUI_CUSTOMFUNCTION_GUIINIT tiancodeGuiInit
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW tiancodeInstFilesShow
!else
  !define MUI_CUSTOMFUNCTION_UNGUIINIT un.tiancodeUnGuiInit
!endif

; ------------------------------------------------------------
; Cierre limpio de procesos anteriores (sin auto-eliminarse ni matar árbol del instalador)
; ------------------------------------------------------------
!ifndef BUILD_UNINSTALLER
!macro customInit
  ; Eliminar desinstalador anterior en el directorio de instalación para que no mate el instalador
  ${if} ${FileExists} "$INSTDIR\Uninstall Tiancode.exe"
    Delete "$INSTDIR\Uninstall Tiancode.exe"
  ${endif}

  ; Obtener PID del instalador actual para no auto-eliminarse
  System::Call 'kernel32::GetCurrentProcessId() i .r0'
  ; Terminación sin /T para NO matar el proceso instalador hijo iniciado por el actualizador
  nsExec::Exec 'taskkill /F /IM Tiancode.exe /FI "PID ne $0"'
  Pop $1
  nsExec::Exec 'taskkill /F /IM Tiancode-portable.exe /FI "PID ne $0"'
  Pop $1
  nsExec::Exec 'taskkill /F /IM tiancode-cli.exe /FI "PID ne $0"'
  Pop $1
!macroend
!endif

; ------------------------------------------------------------
; Manejador de resultado de desinstalación previa (actualización tolerante a fallos)
; ------------------------------------------------------------
!ifndef BUILD_UNINSTALLER
!macro customUnInstallCheck
  ClearErrors
!macroend

!macro customUnInstallCheckCurrentUser
  ClearErrors
!macroend
!endif

; ------------------------------------------------------------
; Estilo Dark Theme aplicado directamente a la ventana compacta (SpiderBanner / oneClick)
; ------------------------------------------------------------
!ifndef BUILD_UNINSTALLER
!macro customCheckAppRunning
  ${If} $hwndparent != 0
    ; 1. Dark Mode e inmersión nativa en la barra de título de SpiderBanner ($hwndparent)
    System::Call 'dwmapi::DwmSetWindowAttribute(i $hwndparent, i 19, *i 1, i 4)'
    System::Call 'dwmapi::DwmSetWindowAttribute(i $hwndparent, i 20, *i 1, i 4)'
    System::Call 'dwmapi::DwmSetWindowAttribute(i $hwndparent, i 35, *i 0x00201A18, i 4)'
    System::Call 'dwmapi::DwmSetWindowAttribute(i $hwndparent, i 36, *i 0x00F0F2F5, i 4)'
    System::Call 'dwmapi::DwmSetWindowAttribute(i $hwndparent, i 34, *i 0x003A2E2C, i 4)'
    System::Call 'dwmapi::DwmSetWindowAttribute(i $hwndparent, i 33, *i 2, i 4)'
    SetCtlColors $hwndparent 0xF0F2F5 0x181A20

    ; Crear brocha sólida oscura para el fondo del sistema (#181A20)
    System::Call 'gdi32::CreateSolidBrush(i 0x00201A18) i .r9'
    System::Call 'user32::SetClassLongW(i $hwndparent, i -10, i r9)'

    ; 2. Localizar diálogos hijos de SpiderBanner (#32770)
    FindWindow $R0 "#32770" "" $hwndparent
    FindWindow $R1 "#32770" "" $hwndparent $R0
    ${If} $R1 == 0
      StrCpy $R1 $R0
    ${EndIf}

    ${If} $R0 != 0
      System::Call 'user32::SetClassLongW(i $R0, i -10, i r9)'
      SetCtlColors $R0 0xF0F2F5 0x181A20
    ${EndIf}

    ${If} $R1 != 0
      System::Call 'user32::SetClassLongW(i $R1, i -10, i r9)'
      SetCtlColors $R1 0xF0F2F5 0x181A20

      ; Control 1000 ("Instalando, espera un momento...")
      GetDlgItem $R2 $R1 1000
      ${If} $R2 != 0
        SetCtlColors $R2 0xF0F2F5 0x181A20
      ${EndIf}

      ; Control 1002 (subtítulo)
      GetDlgItem $R3 $R1 1002
      ${If} $R3 != 0
        SetCtlColors $R3 0xF0F2F5 0x181A20
      ${EndIf}

      ; Control 1003 (detalle)
      GetDlgItem $R4 $R1 1003
      ${If} $R4 != 0
        SetCtlColors $R4 0xF0F2F5 0x181A20
      ${EndIf}

      ; Control 1025 (icono)
      GetDlgItem $R5 $R1 1025
      ${If} $R5 != 0
        SetCtlColors $R5 0xF0F2F5 0x181A20
      ${EndIf}

      ; Control 1001 (barra de progreso msctls_progress32)
      GetDlgItem $R6 $R1 1001
      ${If} $R6 != 0
        SendMessage $R6 0x2001 0 0x00201A18 ; PBM_SETBKCOLOR (#181A20)
        SendMessage $R6 1033 0 0x0045D06A   ; PBM_SETBARCOLOR (verde vibrante #6AD045)
      ${EndIf}
    ${EndIf}

    ; Buscar barra de progreso hija directa si existe
    FindWindow $R7 "msctls_progress32" "" $hwndparent
    ${If} $R7 != 0
      SendMessage $R7 0x2001 0 0x00201A18
      SendMessage $R7 1033 0 0x0045D06A
    ${EndIf}

    ; Forzar redibujado de la ventana y sus controles
    System::Call 'user32::InvalidateRect(i $hwndparent, i 0, i 1)'
    System::Call 'user32::UpdateWindow(i $hwndparent)'
    ${If} $R1 != 0
      System::Call 'user32::InvalidateRect(i $R1, i 0, i 1)'
      System::Call 'user32::UpdateWindow(i $R1)'
    ${EndIf}
  ${EndIf}

  ; Cierre limpio de procesos anteriores sin auto-terminarse (sin /T para preservar el instalador)
  System::Call 'kernel32::GetCurrentProcessId() i .r0'
  nsExec::Exec 'taskkill /F /IM Tiancode.exe /FI "PID ne $0"'
  Pop $1
  nsExec::Exec 'taskkill /F /IM tiancode-cli.exe /FI "PID ne $0"'
  Pop $1
!macroend
!endif

; ------------------------------------------------------------
; Inicializacion grafica y tema oscuro nativo
; ------------------------------------------------------------
!ifndef BUILD_UNINSTALLER
Function tiancodeGuiInit
  ; Dark Mode nativo inmersivo (Win 10 build 17763+ = 19, Win 10 18985+ / Win 11 = 20)
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 19, *i 1, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 20, *i 1, i 4)'

  ; Color de la barra de titulo (Caption): BGR 0x00201A18 (#181A20)
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 35, *i 0x00201A18, i 4)'

  ; Color del texto del titulo: BGR 0x00F0F2F5 (#F0F2F5)
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 36, *i 0x00F0F2F5, i 4)'

  ; Color del borde: BGR 0x003A2E2C (#2C2E3A)
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 34, *i 0x003A2E2C, i 4)'

  ; Superficie general de la ventana exterior ($HWNDPARENT)
  SetCtlColors $HWNDPARENT 0xF0F2F5 0x181A20

  ; Fondo del dialogo interior (#32770)
  FindWindow $R0 "#32770" "" $HWNDPARENT
  ${If} $R0 != 0
    SetCtlColors $R0 0xF0F2F5 0x181A20
  ${EndIf}

  ; Botones inferiores visibles y estilizados en tema oscuro
  GetDlgItem $R1 $HWNDPARENT 1
  ${If} $R1 != 0
    SetCtlColors $R1 0xF0F2F5 0x252836
  ${EndIf}

  GetDlgItem $R2 $HWNDPARENT 2
  ${If} $R2 != 0
    SetCtlColors $R2 0xF0F2F5 0x252836
  ${EndIf}

  GetDlgItem $R3 $HWNDPARENT 3
  ${If} $R3 != 0
    SetCtlColors $R3 0xF0F2F5 0x252836
  ${EndIf}

  ; Separador inferior
  GetDlgItem $R4 $HWNDPARENT 1038
  ${If} $R4 != 0
    SetCtlColors $R4 "" 0x2C2E3A
  ${EndIf}

  ; Separador superior
  GetDlgItem $R5 $HWNDPARENT 1035
  ${If} $R5 != 0
    SetCtlColors $R5 "" 0x2C2E3A
  ${EndIf}

  ; Texto de branding inferior
  GetDlgItem $R6 $HWNDPARENT 1028
  ${If} $R6 != 0
    SetCtlColors $R6 0x8A8E9B transparent
  ${EndIf}
FunctionEnd

Function tiancodeInstFilesShow
  FindWindow $R0 "#32770" "" $HWNDPARENT
  ${If} $R0 != 0
    SetCtlColors $R0 0xF0F2F5 0x181A20

    ; Texto de progreso (1006)
    GetDlgItem $R1 $R0 1006
    ${If} $R1 != 0
      SetCtlColors $R1 0xF0F2F5 transparent
    ${EndIf}

    ; Subtitulo / descripcion de accion (1000)
    GetDlgItem $R2 $R0 1000
    ${If} $R2 != 0
      SetCtlColors $R2 0xF0F2F5 transparent
    ${EndIf}

    ; Boton detalles (1027)
    GetDlgItem $R3 $R0 1027
    ${If} $R3 != 0
      SetCtlColors $R3 0xF0F2F5 0x252836
    ${EndIf}
  ${EndIf}
FunctionEnd
!endif

!ifdef BUILD_UNINSTALLER
Function un.tiancodeUnGuiInit
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 19, *i 1, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 20, *i 1, i 4)'
  SetCtlColors $HWNDPARENT 0xF0F2F5 0x181A20
FunctionEnd
!endif

