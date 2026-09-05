; ============================================================
; Tiancode — NSIS Dark Acrylic / Glass Installer (Win 10/11)
; Exact surface tone: #1E1F28 with DWM Acrylic backdrop
; ============================================================

!include "LogicLib.nsh"
!include "WinVer.nsh"

; Definiciones de color para Modern UI 2 (MUI2)
!define MUI_BGCOLOR "1E1F28"
!define MUI_TEXTCOLOR "F0F2F5"
!define MUI_HEADER_TRANSPARENT_TEXT
!define MUI_INSTFILESPAGE_COLORS "0xF0F2F5 0x1E1F28"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"

!ifndef BUILD_UNINSTALLER
  !define MUI_CUSTOMFUNCTION_GUIINIT tiancodeGuiInit
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW tiancodeInstFilesShow
!else
  !define MUI_CUSTOMFUNCTION_UNGUIINIT un.tiancodeUnGuiInit
!endif

; ------------------------------------------------------------
; Cierre limpio de procesos anteriores
; ------------------------------------------------------------
!macro customInit
  nsExec::Exec 'taskkill /F /IM Tiancode.exe /T'
  nsExec::Exec 'taskkill /F /IM Tiancode-portable.exe /T'
  nsExec::Exec 'taskkill /F /IM tiancode-cli.exe /T'
!macroend

; ------------------------------------------------------------
; Inicializacion grafica y efectos Glass / Dark Acrylic
; ------------------------------------------------------------
!ifndef BUILD_UNINSTALLER
Function tiancodeGuiInit
  ; Dark Mode nativo inmersivo (Win 10 build 17763+ = 19, Win 10 18985+ / Win 11 = 20)
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 19, *i 1, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 20, *i 1, i 4)'

  ; Efecto Backdrop Acrilico / Glass de Windows 11 (22H2+)
  ; DWMWA_SYSTEMBACKDROP_TYPE = 38 (3 = Acrylic, 2 = Mica)
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 38, *i 3, i 4)'

  ; Esquinas redondeadas nativas de Windows 11 (DWMWA_WINDOW_CORNER_PREFERENCE = 33, 2 = Round)
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 33, *i 2, i 4)'

  ; Color de la barra de titulo (Caption): BGR 0x00281F1E (#1E1F28)
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 35, *i 0x00281F1E, i 4)'

  ; Color del texto del titulo: BGR 0x00F0F2F5 (#F0F2F5)
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 36, *i 0x00F0F2F5, i 4)'

  ; Color del borde: BGR 0x003A2E2C (#2C2E3A)
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 34, *i 0x003A2E2C, i 4)'

  ; Superficie general de la ventana exterior ($HWNDPARENT)
  SetCtlColors $HWNDPARENT 0xF0F2F5 0x1E1F28

  ; Ocultar botones estandar para que funcione como instalador one-click visible
  ; ID 1 = Siguiente / Instalar
  GetDlgItem $R1 $HWNDPARENT 1
  ${If} $R1 != 0
    ShowWindow $R1 0
  ${EndIf}

  ; ID 2 = Cancelar
  GetDlgItem $R2 $HWNDPARENT 2
  ${If} $R2 != 0
    ShowWindow $R2 0
  ${EndIf}

  ; ID 3 = Atras
  GetDlgItem $R3 $HWNDPARENT 3
  ${If} $R3 != 0
    ShowWindow $R3 0
  ${EndIf}

  ; Separadores divisorios
  GetDlgItem $R4 $HWNDPARENT 1035
  ${If} $R4 != 0
    ShowWindow $R4 0
  ${EndIf}

  GetDlgItem $R5 $HWNDPARENT 1038
  ${If} $R5 != 0
    ShowWindow $R5 0
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
    SetCtlColors $R0 0xF0F2F5 0x1E1F28

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

    ; Ocultar boton "Mostrar detalles" (1027) para diseno minimalista
    GetDlgItem $R3 $R0 1027
    ${If} $R3 != 0
      ShowWindow $R3 0
    ${EndIf}
  ${EndIf}
FunctionEnd
!endif

!ifdef BUILD_UNINSTALLER
Function un.tiancodeUnGuiInit
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 19, *i 1, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 20, *i 1, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 38, *i 3, i 4)'
  SetCtlColors $HWNDPARENT 0xF0F2F5 0x1E1F28
FunctionEnd
!endif

; ------------------------------------------------------------
; Lanzamiento automatico y salida limpia
; ------------------------------------------------------------
!ifndef BUILD_UNINSTALLER
!macro customFinishPage
  ; Vacio para no insertar pagina MUI_PAGE_FINISH innecesaria
!macroend

!macro customInstall
  ; Breve pausa de 500ms para apreciar la barra al 100%
  Sleep 500
  ${if} ${FileExists} "$appExe"
    ${if} ${isUpdated}
      ${StdUtils.ExecShellAsUser} $0 "$appExe" "open" "--updated"
    ${else}
      ${StdUtils.ExecShellAsUser} $0 "$appExe" "open" ""
    ${endif}
  ${else}
    ${if} ${isUpdated}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--updated"
    ${else}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
    ${endif}
  ${endif}
  !insertmacro quitSuccess
!macroend
!endif
