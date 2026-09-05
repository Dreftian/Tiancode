; ============================================================
; Tiancode — NSIS Dark Glass Installer & Safe Process Cleanup
; ============================================================

!include "LogicLib.nsh"

!macro customInit
  ; Terminar instancias previas de Tiancode para evitar bloqueos
  ; de archivos y de base de datos SQLite durante la actualizacion.
  nsExec::Exec 'taskkill /F /IM Tiancode.exe /T'
  nsExec::Exec 'taskkill /F /IM Tiancode-portable.exe /T'
  nsExec::Exec 'taskkill /F /IM tiancode-cli.exe /T'
!macroend

!macro customGUIInit
  ; Activar Dark Mode inmersivo nativo en la barra de titulo de Windows 10/11
  ; DWMWA_USE_IMMERSIVE_DARK_MODE = 20
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 20, *i 1, i 4)'

  ; Activar efecto Acrilico / Glass de Windows 11 (22H2+)
  ; DWMWA_SYSTEMBACKDROP_TYPE = 38 (3 = Acrylic, 2 = Mica)
  System::Call 'dwmapi::DwmSetWindowAttribute(i $HWNDPARENT, i 38, *i 3, i 4)'

  ; Colores de tema oscuro y superficie glass (#0c0e14 y texto #f0f2f5)
  FindWindow $R0 "#32770" "" $HWNDPARENT
  SetCtlColors $HWNDPARENT 0xF0F2F5 0x0C0E14
  SetCtlColors $R0 0xF0F2F5 0x0C0E14

  ; Etiquetas estaticas y de progreso
  GetDlgItem $R1 $R0 1000
  ${If} $R1 != 0
    SetCtlColors $R1 0xF0F2F5 0x0C0E14
  ${EndIf}

  GetDlgItem $R2 $R0 1004
  ${If} $R2 != 0
    SetCtlColors $R2 0xF0F2F5 0x0C0E14
  ${EndIf}

  GetDlgItem $R3 $R0 1006
  ${If} $R3 != 0
    SetCtlColors $R3 0xF0F2F5 0x0C0E14
  ${EndIf}

  GetDlgItem $R4 $R0 1027
  ${If} $R4 != 0
    SetCtlColors $R4 0xF0F2F5 0x0C0E14
  ${EndIf}
!macroend
