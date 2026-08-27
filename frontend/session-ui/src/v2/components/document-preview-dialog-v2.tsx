import { Dialog as Kobalte } from "@kobalte/core/dialog"
import { useI18n } from "@tiancode-ai/ui/context/i18n"
import { IconButton } from "@tiancode-ai/ui/icon-button"
import { DocumentViewer } from "../../components/document-viewer"
import type { DocumentKind } from "../../pierre/media"

export interface DocumentPreviewDialogV2Props {
  kind: DocumentKind
  base64: string
  filename?: string
}

// Mirrors ImagePreview's dialog shell so document attachments open in the same
// host (frontend/ui/src/context/dialog.tsx show()).
export function DocumentPreviewDialogV2(props: DocumentPreviewDialogV2Props) {
  const i18n = useI18n()
  return (
    <div data-component="document-preview-dialog-v2">
      <div data-slot="image-preview-container">
        <Kobalte.Content data-slot="image-preview-content">
          <div data-slot="image-preview-header">
            <Kobalte.CloseButton
              data-slot="image-preview-close"
              as={IconButton}
              icon="close"
              variant="ghost"
              aria-label={i18n.t("ui.common.close")}
            />
          </div>
          <div data-slot="document-preview-dialog-v2-body">
            <DocumentViewer kind={props.kind} base64={props.base64} path={props.filename} />
          </div>
        </Kobalte.Content>
      </div>
    </div>
  )
}
