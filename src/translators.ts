import { PostProcessResult, TranslatorConfigObject } from '@clearfeed-ai/node-html-markdown'
import { tagSurround, isWhiteSpaceOnly } from './utils'
// import { ElementNode } from 'node-html-markdown/dist/nodes'

// interface CustomNode extends ElementNode {
//   rawAttributes: Record<string, string>
// }
const translators: TranslatorConfigObject = {
  /* Slack link */
  a: ({ node }) => {
    const href = node.getAttribute('href')
    if (!href) return {}

    // Encodes symbols that can cause problems in markdown
    let encodedHref = ''
    for (const chr of href) {
      switch (chr) {
        case '(':
          encodedHref += '%28'
          break
        case ')':
          encodedHref += '%29'
          break
        case '_':
          encodedHref += '%5F'
          break
        case '*':
          encodedHref += '%2A'
          break
        default:
          encodedHref += chr
      }
    }

    const title = node.getAttribute('title')

    return {
      postprocess: ({ content }) => {
        return `<${encodedHref}${title ? ` "${title}"` : ''}|${content.replace(/(?:\r?\n)+/g, ' ')}>`
      }
    }
  },
  // Slack doesn't support headings, so we'll just make them all bold
  'h1,h2,h3,h4,h5,h6': {
    spaceIfRepeatingChar: true,
    postprocess: ({ content, options: { strongDelimiter } }) =>
      isWhiteSpaceOnly(content) ? PostProcessResult.RemoveNode : tagSurround(content, strongDelimiter)
  },
  // Slack doesn't support images, so just show the link
  img: () => {
    return {
      postprocess: ({ node, parent }) => {
        const attributes = node.attributes
        if (parent && parent.tagName === 'A') {
          return attributes['alt'] || attributes['src']
        } else if (attributes['alt']) {
          return `<${attributes['src']}|${attributes['alt']}>`
        } else {
          return attributes['src']
        }
      }
    }
  },
  /**
   * Slack mention markup (`<@U123>`, `<#C123>`, `<!subteam^S123>`) carried on the
   * element rather than in its text, so the entity escaping does not consume it.
   * Emitting it from `postprocess` keeps it generated output, not node text.
   *
   * A span without the attribute is left to the default handling.
   */
  span: ({ node }) => {
    const mentionTag = node.getAttribute('data-mention-tag')
    if (!mentionTag) return {}

    return { postprocess: () => mentionTag }
  },
  'p': {
    surroundingNewlines: 1
  },
  'div': {
    surroundingNewlines: 1
  }
}

export default translators
