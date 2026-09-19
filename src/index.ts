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
 * Every representation the parser decodes to `&`, `<` or `>` has to be covered, not just
 * `&amp;`/`&lt;`/`&gt;`: it decodes with browser rules, so `&#60;`, `&#060;`, `&#x3C;`,
 * `&LT;` and even the semicolon-less `&lt` all produce a `<`. Inbound email decides its
 * own encoding, so the uncommon forms are not hypothetical. Each is rewritten to the
 * doubly-escaped canonical form, and a reference that decodes to anything else is left
 * as it is.
 *
 * Actual tags are skipped, so entities already inside `href`/`src`/`title` are not
 * double-escaped. Slack mention entities are left at one level so the decode restores
 * them: a producer writing `&lt;@U123&gt;` into a text node means the mention.
 */
const TAG_PATTERN = '<!--[\\s\\S]*?-->|<[!/?a-zA-Z][^>"\']*(?:(?:"[^"]*"|\'[^\']*\')[^>"\']*)*>'
const SLACK_ENTITY_PATTERN = '&lt;[@#!](?:(?!&gt;)[\\s\\S])*?&gt;'
// Named forms are the ones HTML defines for these characters - lower case and all caps,
// each with an optional semicolon. `&Lt;` is a different character and is left alone.
const ENTITY_REFERENCE_PATTERN = '&(?:amp|AMP|lt|LT|gt|GT);?|&#[0-9]+;?|&#[xX][0-9a-fA-F]+;?'

const tagOrEntityRegExp = new RegExp(
  `${TAG_PATTERN}|${SLACK_ENTITY_PATTERN}|(${ENTITY_REFERENCE_PATTERN})`,
  'g'
)

const namedReferenceCodePoints: Record<string, number> = {
  amp: 38,
  AMP: 38,
  lt: 60,
  LT: 60,
  gt: 62,
  GT: 62
}

const doublyEscapedByCodePoint: Record<number, string> = {
  38: '&amp;amp;',
  60: '&amp;lt;',
  62: '&amp;gt;'
}

const codePointOf = (reference: string): number => {
  const body = reference.slice(1).replace(/;$/, '')
  if (body.charAt(0) !== '#') return namedReferenceCodePoints[body]

  const digits = body.slice(1)
  return digits.charAt(0) === 'x' || digits.charAt(0) === 'X'
    ? parseInt(digits.slice(1), 16)
    : parseInt(digits, 10)
}

const preserveAuthoredEntities = (html: string): string =>
  html.replace(tagOrEntityRegExp, (match, reference?: string) =>
    reference ? doublyEscapedByCodePoint[codePointOf(reference)] ?? match : match
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
