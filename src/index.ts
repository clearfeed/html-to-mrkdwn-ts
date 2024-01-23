import { NodeHtmlMarkdown, NodeHtmlMarkdownOptions } from 'node-html-markdown'
import translators from './translators'
import { findFirstImageSrc } from './utils'

const baseOptions: Partial<NodeHtmlMarkdownOptions> = {
  /**
   * Marker used by Slack mrkdwn for bullet lists.
   */
  bulletMarker: '•',
  /**
   * In Slack mrkdwn: {@link https://api.slack.com/reference/surfaces/formatting#basics}
   * - Bold text is represented by a single asterisk (*),
   *   deviating from the standard double asterisks (**) used in regular Markdown.
   * - Strikethrough is denoted by a single tilde (~),
   *   in contrast to the standard double tilde (~~) used in regular Markdown.
   */

  strongDelimiter: '*',
  strikeDelimiter: '~',
  globalEscape: [] as any,
  lineStartEscape: [] as any
}

const htmlToMrkdwn = (html: string, options: Partial<NodeHtmlMarkdownOptions> = {}) => {
  const result = NodeHtmlMarkdown.translate(html, { ...baseOptions, ...options }, translators)
  return {
    text: result,
    image: findFirstImageSrc(html)
  }
}

export default htmlToMrkdwn
