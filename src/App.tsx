import { HocuspocusProvider } from "@hocuspocus/provider"
import { Editor } from "./Editor"
import { Preview, PreviewProps } from "./Preview"
import { createResource, createSignal, JSX, Show, splitProps } from "solid-js";
import ky from 'ky'

enum PaneState {
  EDITOR_AND_PREVIEW,
  EDITOR_ONLY,
  PREVIEW_ONLY
}

function hasEditor(s: PaneState) {
  return (s == PaneState.EDITOR_ONLY || s == PaneState.EDITOR_AND_PREVIEW)
}

function hasPreview(s: PaneState) {
  return (s == PaneState.PREVIEW_ONLY || s == PaneState.EDITOR_AND_PREVIEW)
}

type TopBarChoiceProps = {
  enabled: boolean,
} & JSX.HTMLAttributes<HTMLButtonElement>

function TopBarChoice(props: TopBarChoiceProps) {
  const [, rest] = splitProps(props, ["enabled"])
  return (
    <button
      class="py-1 px-3 border-1 border-solid border-black"
      classList={{
        "bg-slate-200": props.enabled,
        "hover:bg-slate-300": props.enabled,
        "hover:bg-slate-100": !props.enabled
      }}
      {...rest}>
      {props.children}
    </button>
  )
}

type TopBarProps = {
  state: PaneState,
  setState: (s: PaneState) => void
}

function TopBar(props: TopBarProps) {
  return (
    <div class="flex flex-row">
      <TopBarChoice
        enabled={props.state == PaneState.EDITOR_ONLY}
        onClick={_ => props.setState(PaneState.EDITOR_ONLY)}>
        <div class="i-tabler-ballpen-filled" />
      </TopBarChoice>
      <TopBarChoice
        enabled={props.state == PaneState.EDITOR_AND_PREVIEW}
        onClick={_ => props.setState(PaneState.EDITOR_AND_PREVIEW)}>
        <div class="i-tabler-ballpen-filled" />
        <div class="i-tabler-eye" />
      </TopBarChoice>
      <TopBarChoice
        enabled={props.state == PaneState.PREVIEW_ONLY}
        onClick={_ => props.setState(PaneState.PREVIEW_ONLY)}>
        <div class="i-tabler-eye" />
      </TopBarChoice>
    </div>
  )
}

async function loadPreview(): Promise<PreviewProps> {
  const content = await (await ky.get('/built/ocl-0001.xml')).text()
  const xsl = await (await ky.get('/built/forest.xsl')).text()
  console.log("got new content")
  return { content, xsl }
}

function App() {
  // Connect it to the backend
  const provider = new HocuspocusProvider({
    url: "/collaboration",
    name: "ocl-0001.tree",
  });

  // Define `tasks` as an Array

  const ytext = provider.document.getText('content')

  const [paneState, setPaneState] = createSignal(PaneState.EDITOR_AND_PREVIEW)

  const [preview, { mutate }] = createResource(loadPreview)

  return (
    <div class="container font-sans mx-auto">
      <TopBar state={paneState()} setState={setPaneState} />
      <div class="flex flex-row">
        <Show when={hasEditor(paneState())}>
          <div class="flex-1 p-4">
            <Editor
              ytext={ytext}
              provider={provider}
              setContent={(content: string) =>
                mutate(p => { return {xsl: p?.xsl as string, content} })
              }/>
          </div>
        </Show>
        <Show when={hasPreview(paneState())}>
          <div class="flex-1 p-4">
            <Show when={preview()}>
              {props => <Preview {...props()}/>}
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}

export default App
