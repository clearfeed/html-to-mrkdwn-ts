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
  globalEscape: [] as any,
  lineStartEscape: [] as any
}

/**
 * Text entities must still be escaped after node-html-markdown parses the HTML, or a tag
 * the author typed is stored raw and later reaches the DOM as live markup. Escaping one
 * extra level up front inverts the parser's single decode.
 *
 * This runs before parsing rather than through `textReplace`, because `pre`/`code` are
 * translated with `noEscape` and the visitor returns a text node before `textReplace` is
 * reached - so a rule there never sees code block content, the content that most needs
 * escaping.
 *
 * Actual tags are skipped, so entities already inside `href`/`src`/`title` are not
 * double-escaped. Slack mention entities are left at one level so the decode restores
 * them: a producer writing `&lt;@U123&gt;` into a text node means the mention.
 */
const TAG_PATTERN = '<!--[\\s\\S]*?-->|<[!/?a-zA-Z][^>"\']*(?:(?:"[^"]*"|\'[^\']*\')[^>"\']*)*>'
const SLACK_ENTITY_PATTERN = '&lt;[@#!](?:(?!&gt;)[\\s\\S])*?&gt;'

const tagOrEntityRegExp = new RegExp(
  `${TAG_PATTERN}|${SLACK_ENTITY_PATTERN}|&(amp|lt|gt);`,
  'g'
)

const preserveAuthoredEntities = (html: string): string =>
  html.replace(tagOrEntityRegExp, (match, entityName?: string) =>
    entityName ? `&amp;${entityName};` : match
  )

const htmlToMrkdwn = (
  html: string,
  options: Partial<NodeHtmlMarkdownOptions> = {},
  translators: TranslatorConfigObject = {}
) => {
  const result = NodeHtmlMarkdown.translate(
    preserveAuthoredEntities(html),
    { ...baseOptions, ...options },
    { ...baseTranslators, ...translators }
  );

  return {
    text: result,
    image: findFirstImageSrc(html)
  }
}

export default htmlToMrkdwn
