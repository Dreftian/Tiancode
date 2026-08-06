import { createUniqueId, type ComponentProps } from "solid-js"

export function WordmarkV2(props: Pick<ComponentProps<"svg">, "class">) {
  const mask = createUniqueId()
  const maskGradient = createUniqueId()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 720 129"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g opacity="0.6">
        <g mask={`url(#${mask})`}>
          <g opacity="0.16">
            <path
              opacity="0.7"
              d="M73.85 18H0V36.43H27.7V110.14H46.15V36.43H73.85V18Z"
              fill="currentColor"
            />
            <path
              opacity="0.7"
              d="M138.2 18H119.7V110.14H138.2V18Z"
              fill="currentColor"
            />
            <path
              opacity="0.7"
              d="M240.9 36.43H202.9V110.14H240.9V36.43ZM258.8 110.14H185V18H258.8V110.14Z"
              fill="currentColor"
            />
            <path
              opacity="0.7"
              d="M332.385 36.4286H295.462V110.143H277V18H332.385V36.4286ZM350.846 110.143H332.385V36.4286H350.846V110.143Z"
              fill="currentColor"
            />
            <path
              opacity="0.7"
              d="M442.846 36.4286H387.462V91.7143H442.846V110.143H369V18H442.846V36.4286Z"
              fill="currentColor"
            />
            <path
              opacity="0.7"
              d="M517.385 36.4286H480.462V91.7143H517.385V36.4286ZM535.846 110.143H462V18H535.846V110.143Z"
              fill="currentColor"
            />
            <path
              opacity="0.7"
              d="M609.385 36.8571H572.462V92.1429H609.385V36.8571ZM627.846 110.571H554V18.4286H609.385V0H627.846V110.571Z"
              fill="currentColor"
            />
            <path
              opacity="0.7"
              d="M664.462 36.4286V54.8571H701.385V36.4286H664.462ZM719.846 73.2857H664.462V91.7143H719.846V110.143H646V18H719.846V73.2857Z"
              fill="currentColor"
            />
          </g>
        </g>
      </g>
      <defs>
        <mask id={mask} style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="720" height="129">
          <rect width="720" height="129" fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient id={maskGradient} x1="360" y1="68" x2="360" y2="129" gradientUnits="userSpaceOnUse">
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
