'use client'

import { useState, useRef } from 'react'

interface ExportMenuProps {
  getHTML: () => string
  getJSON: () => any
  documentTitle: string
}

export default function ExportMenu({ getHTML, getJSON, documentTitle }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const exportMarkdown = () => {
    const json = getJSON()
    const md = jsonToMarkdown(json)
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${documentTitle || 'document'}.md`
    a.click()
    URL.revokeObjectURL(url)
    setIsOpen(false)
  }

  const exportPDF = async () => {
    const html = getHTML()
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${documentTitle}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #1a1a1a; }
            h1 { font-size: 2em; margin-bottom: 0.5em; }
            h2 { font-size: 1.5em; margin-top: 1.5em; margin-bottom: 0.5em; }
            h3 { font-size: 1.2em; margin-top: 1.2em; margin-bottom: 0.4em; }
            p { margin-bottom: 1em; }
            ul, ol { margin-bottom: 1em; padding-left: 2em; }
            blockquote { border-left: 3px solid #ccc; padding-left: 1em; color: #555; margin: 1em 0; }
            code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
            pre { background: #f5f5f5; padding: 16px; border-radius: 8px; overflow-x: auto; }
            pre code { background: none; padding: 0; }
            table { border-collapse: collapse; width: 100%; margin: 1em 0; }
            th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
            th { background: #f5f5f5; font-weight: 600; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>${html}</body>
        </html>
      `)
      printWindow.document.close()
      setTimeout(() => {
        printWindow.print()
      }, 500)
    }
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-400"
        title="Export"
      >
        Export
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
          <button
            onClick={exportMarkdown}
            className="w-full flex items-center gap-2 p-3 text-sm text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <span>📄</span> Export as Markdown
          </button>
          <button
            onClick={exportPDF}
            className="w-full flex items-center gap-2 p-3 text-sm text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border-t border-zinc-100 dark:border-zinc-800"
          >
            <span>📋</span> Print / Save as PDF
          </button>
        </div>
      )}
    </div>
  )
}

/** Simple TipTap JSON to Markdown converter */
function jsonToMarkdown(doc: any): string {
  if (!doc || !doc.content) return ''
  return doc.content.map((node: any) => nodeToMarkdown(node)).join('\n')
}

function nodeToMarkdown(node: any, depth = 0): string {
  switch (node.type) {
    case 'paragraph':
      return inlineToMarkdown(node.content) + '\n'
    case 'heading': {
      const level = node.attrs?.level || 1
      return '#'.repeat(level) + ' ' + inlineToMarkdown(node.content) + '\n'
    }
    case 'bulletList':
      return (node.content || []).map((li: any) => '- ' + listItemContent(li)).join('\n') + '\n'
    case 'orderedList':
      return (
        (node.content || [])
          .map((li: any, i: number) => `${i + 1}. ` + listItemContent(li))
          .join('\n') + '\n'
      )
    case 'taskList':
      return (
        (node.content || [])
          .map((li: any) => {
            const checked = li.attrs?.checked ? 'x' : ' '
            return `- [${checked}] ` + listItemContent(li)
          })
          .join('\n') + '\n'
      )
    case 'blockquote':
      return (node.content || []).map((n: any) => '> ' + nodeToMarkdown(n).trim()).join('\n') + '\n'
    case 'codeBlock': {
      const lang = node.attrs?.language || ''
      return (
        '```' +
        lang +
        '\n' +
        (node.content?.map((n: any) => n.text || '').join('') || '') +
        '\n```\n'
      )
    }
    case 'horizontalRule':
      return '---\n'
    case 'table':
      return tableToMarkdown(node) + '\n'
    default:
      if (node.content) {
        return node.content.map((n: any) => nodeToMarkdown(n, depth)).join('')
      }
      return node.text || ''
  }
}

function listItemContent(li: any): string {
  if (!li.content) return ''
  return li.content.map((n: any) => nodeToMarkdown(n).trim()).join(' ')
}

function inlineToMarkdown(content: any[]): string {
  if (!content) return ''
  return content
    .map((node: any) => {
      let text = node.text || ''
      if (node.marks) {
        for (const mark of node.marks) {
          switch (mark.type) {
            case 'bold':
              text = `**${text}**`
              break
            case 'italic':
              text = `*${text}*`
              break
            case 'underline':
              text = `<u>${text}</u>`
              break
            case 'code':
              text = '`' + text + '`'
              break
            case 'link':
              text = `[${text}](${mark.attrs?.href || ''})`
              break
            case 'strike':
              text = `~~${text}~~`
              break
          }
        }
      }
      return text
    })
    .join('')
}

function tableToMarkdown(tableNode: any): string {
  if (!tableNode.content) return ''
  const rows = tableNode.content
  const lines: string[] = []

  rows.forEach((row: any, rowIndex: number) => {
    if (!row.content) return
    const cells = row.content.map((cell: any) => {
      return inlineToMarkdown(cell.content?.[0]?.content || [])
    })
    lines.push('| ' + cells.join(' | ') + ' |')
    if (rowIndex === 0) {
      lines.push('| ' + cells.map(() => '---').join(' | ') + ' |')
    }
  })

  return lines.join('\n')
}
