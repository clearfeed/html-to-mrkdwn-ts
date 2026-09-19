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
 * Slack's API guarantees the message text it returns has `&`, `<` and `>` escaped, and
 * everything that renders mrkdwn back to HTML relies on that. Converting HTML decodes
 * those entities exactly once, so without this a tag the author typed (`<b>`, or
 * `<img onerror=...>`) is stored raw and later reaches the DOM as live markup.
 *
 * Escaping the entities one extra level up front inverts that decode: `&lt;` becomes
 * `&amp;lt;` and converts back to `&lt;`.
 *
 * This runs on the source HTML rather than through the `textReplace` option on purpose.
 * `pre` and `code` are translated with `noEscape`, and the visitor returns a text node
 * *before* it reaches `globalEscape`/`lineStartEscape`/`textReplace` — so a `textReplace`
 * rule never sees code block content, which is exactly the content that has to be
 * escaped. Rewriting the source is the only hook that reaches it.
 *
 * Because it is the source being rewritten, tags have to be stepped over rather than
 * assumed entity-free: `<a href="...?a=1&amp;b=2">` is ordinary HTML, and escaping that
 * `&amp;` a second level leaves the href pointing at `...?a=1&amp;b=2` once translated.
 * The tag alternative below consumes a whole tag - quoted attribute values included, so
 * a `>` inside one does not end it early - and hands it back untouched.
 *
 * Slack mention entities are left at one level of escaping so the single decode restores
 * them as live markup: they address a user, group or channel rather than describing
 * text, and a producer that writes `&lt;@U123&gt;` into a text node means the mention.
 * `<@U123>` typed literally inside a code block therefore still resolves, which is what
 * Slack itself does with it.
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
