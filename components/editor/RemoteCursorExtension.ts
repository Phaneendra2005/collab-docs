import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface RemoteCursor {
  actorId: string
  name: string
  color: string
  start: number
  end: number
}

export const RemoteCursorKey = new PluginKey('remoteCursors')

export const RemoteCursors = Extension.create({
  name: 'remoteCursors',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: RemoteCursorKey,
        state: {
          init() {
            return DecorationSet.empty
          },
          apply(tr, oldState) {
            const meta = tr.getMeta(RemoteCursorKey)

            if (meta && meta.cursors) {
              const decorations: Decoration[] = []
              const cursors = meta.cursors as RemoteCursor[]

              cursors.forEach((cursor) => {
                // Ensure positions are within document bounds
                const docSize = tr.doc.content.size
                const safeStart = Math.max(0, Math.min(cursor.start, docSize))
                const safeEnd = Math.max(0, Math.min(cursor.end, docSize))

                // Draw selection highlight if there's a range
                if (safeStart !== safeEnd) {
                  const from = Math.min(safeStart, safeEnd)
                  const to = Math.max(safeStart, safeEnd)

                  decorations.push(
                    Decoration.inline(from, to, {
                      style: `background-color: ${cursor.color}40;`, // 40 is hex for 25% opacity
                    }),
                  )
                }

                // Draw the cursor caret
                const cursorElement = document.createElement('span')
                cursorElement.classList.add('remote-cursor')
                cursorElement.style.borderColor = cursor.color

                const labelElement = document.createElement('span')
                labelElement.classList.add('remote-cursor-label')
                labelElement.style.backgroundColor = cursor.color
                labelElement.textContent = cursor.name

                cursorElement.appendChild(labelElement)

                decorations.push(
                  Decoration.widget(safeEnd, cursorElement, {
                    side: 1, // Draw after the content
                    key: `cursor-${cursor.actorId}`,
                  }),
                )
              })

              return DecorationSet.create(tr.doc, decorations)
            }

            // Map the decorations if the document changed (local edits)
            return oldState.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
        },
      }),
    ]
  },
})
