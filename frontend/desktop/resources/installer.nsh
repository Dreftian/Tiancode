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
; Cierre limpio de procesos anteriores (sin auto-eliminarse)
; ------------------------------------------------------------
!macro customInit
  ; Obtener PID del instalador actual para no auto-eliminarse
  System::Call 'kernel32::GetCurrentProcessId() i .r0'
  nsExec::Exec 'taskkill /F /IM Tiancode.exe /FI "PID ne $0" /T'
  nsExec::Exec 'taskkill /F /IM Tiancode-portable.exe /FI "PID ne $0" /T'
  nsExec::Exec 'taskkill /F /IM tiancode-cli.exe /FI "PID ne $0" /T'
!macroend

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

