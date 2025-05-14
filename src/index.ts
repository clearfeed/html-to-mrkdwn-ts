import { NodeHtmlMarkdown, NodeHtmlMarkdownOptions, TranslatorConfigObject } from '@clearfeed-ai/node-html-markdown'
import baseTranslators from './translators'
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

  /**
   * Escape underscores in the text as using underscores in words is common example -> this_is_a_word
   * in NodeHtmlMarkdown we usually escape nested tags and as underscores is used for italic text we remove nested underscores
   * to avoid this we escape underscores in the text
   */
  globalEscape: [/_/gm, '\\$&'] as any,
  lineStartEscape: [] as any
}

const htmlToMrkdwn = (
  html: string,
  options: Partial<NodeHtmlMarkdownOptions> = {},
  translators: TranslatorConfigObject = {}
) => {
  const result = NodeHtmlMarkdown.translate(
    html, 
    { ...baseOptions, ...options },
    { ...baseTranslators, ...translators }
  );
  

  /**
   * As we escape underscores in the text we need to unescape them in the result
   */
  const unescapedResult = result.replace(/\\_/g, '_');

  return {
    text: unescapedResult,
    image: findFirstImageSrc(html)
  }
}

export default htmlToMrkdwn
