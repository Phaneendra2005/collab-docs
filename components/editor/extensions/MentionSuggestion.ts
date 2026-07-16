import { ReactRenderer } from '@tiptap/react'
import tippy, { GetReferenceClientRect, Instance } from 'tippy.js'
import { MentionList } from './MentionList'

export default function createSuggestion(documentId: string) {
  return {
    items: async ({ query }: { query: string }) => {
      try {
        const res = await fetch(`/api/documents/${documentId}/collaborators`)
        const json = await res.json()
        const collaborators = json.data || []

        return collaborators
          .filter((item: any) => {
            const nameMatch = item.name?.toLowerCase().includes(query.toLowerCase())
            const emailMatch = item.email.toLowerCase().includes(query.toLowerCase())
            return nameMatch || emailMatch
          })
          .slice(0, 5)
      } catch (e) {
        console.error('Failed to fetch collaborators for mentions', e)
        return []
      }
    },

    render: () => {
      let component: ReactRenderer<any>
      let popup: Instance[]

      return {
        onStart: (props: any) => {
          component = new ReactRenderer(MentionList, {
            props,
            editor: props.editor,
          })

          if (!props.clientRect) {
            return
          }

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect as GetReferenceClientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
          })
        },

        onUpdate(props: any) {
          component.updateProps(props)

          if (!props.clientRect) {
            return
          }

          popup[0].setProps({
            getReferenceClientRect: props.clientRect as GetReferenceClientRect,
          })
        },

        onKeyDown(props: any) {
          if (props.event.key === 'Escape') {
            popup[0].hide()
            return true
          }

          return component.ref?.onKeyDown(props)
        },

        onExit() {
          popup[0].destroy()
          component.destroy()
        },
      }
    },
  }
}
