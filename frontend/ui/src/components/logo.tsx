import type { ComponentProps } from "solid-js"
import black from "../assets/logo/tian-black.png"
import white from "../assets/logo/tian-white.png"

// Brand logo (PNG wordmark) switched by theme. Both variants always render and
// logo.css toggles which one is visible from `data-color-scheme` on <html>, so
// the correct variant shows up before the theme context hydrates. The default
// (theme not applied yet, or light) is the black logo; dark is the white one.
type LogoProps = Pick<ComponentProps<"span">, "class" | "style" | "ref">

const LogoImages = () => {
  return (
    <>
      <img class="logo-theme-dark" src={black} alt="" draggable={false} />
      <img class="logo-theme-light" src={white} alt="" draggable={false} />
    </>
  )
}

export const Mark = (props: LogoProps) => {
  return (
    <span data-component="logo-mark" ref={props.ref} style={props.style} class={props.class}>
      <LogoImages />
    </span>
  )
}

export const Splash = (props: LogoProps) => {
  return (
    <span data-component="logo-splash" ref={props.ref} style={props.style} class={props.class}>
      <LogoImages />
    </span>
  )
}

export const Logo = (props: LogoProps) => {
  return (
    <span data-component="logo" ref={props.ref} style={props.style} class={props.class}>
      <LogoImages />
    </span>
  )
}
