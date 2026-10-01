import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@tiancode-ai/ui/v2/dialog-v2"
import { useLanguage } from "@/context/language"

/** Removal confirmation in the app's own dialog instead of the native window.confirm. */
export function SettingsConfirmDialog(props: {
  title: string
  description: string
  confirm: string
  onConfirm: () => void
  onClose: () => void
}) {
  const language = useLanguage()
  return (
    <Dialog fit>
      <DialogHeader hideClose>
        <DialogTitleGroup title={props.title} description={props.description} />
      </DialogHeader>
      <DialogFooter>
        <ButtonV2 variant="outline" autofocus onClick={props.onClose}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2
          variant="danger"
          onClick={() => {
            props.onClose()
            props.onConfirm()
          }}
        >
          {props.confirm}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}
