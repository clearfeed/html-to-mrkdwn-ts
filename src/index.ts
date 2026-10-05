import { NodeHtmlMarkdown, NodeHtmlMarkdownOptions, TranslatorConfigObject } from '@clearfeed-ai/node-html-markdown'
import { HTMLElement, Node, NodeType, TextNode, parse } from 'node-html-parser'
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
 * A copy of `nodeHtmlParserConfig` from `@clearfeed-ai/node-html-markdown/dist/config`,
 * which the package does not re-export from its root. Both passes have to parse alike or
 * they disagree on what is text, so keep this in step if the fork ever retunes it.
 */
const parserOptions = {
  lowerCaseTagName: false,
  comment: false,
  fixNestedATags: true,
  blockTextElements: { script: false, noscript: false, style: false }
}

/**
 * Slack syntax a producer wrote into a text node (Quill emits mentions this way) means
 * the real thing, so it passes through. Only these documented forms: anything else
 * shaped like `<!...>`, such as `<!DOCTYPE html>`, is text and gets escaped.
 *
 * Ids carry their type as a prefix - `U`/`W` for users, `C` for channels, `S` for user
 * groups - and slack-to-html resolves only those, so `<@ABC>` is author text. Its user
 * and channel patterns fall back to rendering whatever is inside as a name, so a loose
 * id here does not stay literal downstream; it renders as a mention.
 * {@link https://api.slack.com/reference/surfaces/formatting}
 */
const SLACK_ENTITY_PATTERN =
  '<(?:' +
  [
    '@[UW][A-Z0-9]+', // user mention: <@U012ABCDEF> (W ids come from enterprise grid)
    '#C[A-Z0-9]+', // channel link: <#C012AB3CD>
    '!subteam\\^S[A-Z0-9]+', // user group: <!subteam^S012ABC>
    '!(?:here|channel|everyone)', // broadcast: <!here>
    // date: <!date^1392734382^{date_num}> - the only form carrying an inner `^`-delimited
    // token, so its class excludes `|` to stop before the shared label group below.
    '!date\\^[0-9]+\\^[^|<>]*'
  ].join('|') +
  // Shared by every form above, which is why <#C012AB3CD|general> matches without any
  // alternative spelling the label out itself.
  ')(?:\\|[^<>]*)?>'

const slackEntityOrSpecialCharacter = new RegExp(`${SLACK_ENTITY_PATTERN}|[&<>]`, 'g')
const specialCharacter = /[&<>]/g

const slackEscapeByCharacter: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;'
}

/** Code is quoted verbatim, so Slack syntax inside it is text and gets escaped too. */
const toSlackText = (text: string, inCodeLiteral: boolean): string =>
  text.replace(inCodeLiteral ? specialCharacter : slackEntityOrSpecialCharacter, (match) =>
    slackEscapeByCharacter[match] ?? match
  )

/**
 * node-html-markdown decodes text nodes once, so Slack's `&lt;` is stored as `&amp;lt;`
 * to survive that. `\u00a0` goes back to `&nbsp;` defensively, to hand on the same
 * spelling we were given; no observed behaviour depends on it, since the parser's own
 * whitespace test treats the two alike.
 */
const reparseEscapeByCharacter: Record<string, string> = {
  ...slackEscapeByCharacter,
  '\u00a0': '&nbsp;'
}

const encodeForReparse = (text: string): string =>
  text.replace(/[&<>\u00a0]/g, (character) => reparseEscapeByCharacter[character])

/**
 * The tags node-html-markdown translates with `noEscape`: `pre`, and `code` in every
 * branch of its translator.
 */
const LITERAL_TAGS = new Set(['CODE', 'PRE'])

const forEachTextNode = (
  node: Node,
  visit: (textNode: TextNode, inCodeLiteral: boolean) => void,
  inCodeLiteral = false
): void => {
  for (const child of node.childNodes) {
    if (child.nodeType === NodeType.TEXT_NODE) visit(child as TextNode, inCodeLiteral)
    else {
      const tagName = (child as HTMLElement).rawTagName
      forEachTextNode(child, visit, inCodeLiteral || LITERAL_TAGS.has(tagName?.toUpperCase()))
    }
  }
}

/**
 * The parser reports a doctype as text rather than a node, and node-html-markdown drops it
 * with a `textReplace` rule matching `/^<!DOCTYPE.*>/gmi`. Escaping is what breaks that:
 * once the text node reads `&lt;!DOCTYPE html&gt;` the rule no longer matches, and the
 * declaration is printed into the message. So strip it before escaping.
 *
 * A `&lt;!DOCTYPE html&gt;` an author typed is safe anywhere, anchor or not, because the
 * pattern needs a literal `<`. What the anchor buys is a bound on the delete: it only ever
 * removes from the start of the input. The cost is that a real `<` doctype typed there is
 * dropped rather than escaped (`'<!DOCTYPE html> starts a page'` -> `' starts a page'`) -
 * narrow enough to accept, and the same text inside any element escapes normally.
 */
const LEADING_DOCTYPE = /^\s*<!DOCTYPE[^>]*>/i

/**
 * Runs before node-html-markdown because that decodes text nodes, leaving
 * `&lt;div&gt;` indistinguishable from a real tag; `textReplace` is no help either, since
 * `pre`/`code` use `noEscape` and never reach it. Letting the parser say what is text
 * keeps `href` values and the many spellings of `<` (`&#60;`, `&LT;`, ...) out of our
 * hands.
 */
const normalizeHtmlForSlack = (html: string): string => {
  const root = parse(html.replace(LEADING_DOCTYPE, ''), parserOptions)

  // `text` decodes; `rawText` is written back out verbatim.
  forEachTextNode(root, (textNode, inCodeLiteral) => {
    textNode.rawText = encodeForReparse(toSlackText(textNode.text, inCodeLiteral))
  })

  return root.toString()
}

const htmlToMrkdwn = (
  html: string,
  options: Partial<NodeHtmlMarkdownOptions> = {},
  translators: TranslatorConfigObject = {}
) => {
  const result = NodeHtmlMarkdown.translate(
    normalizeHtmlForSlack(html),
    { ...baseOptions, ...options },
    { ...baseTranslators, ...translators }
  );

  return {
    text: result,
    image: findFirstImageSrc(html)
  }
}

export default htmlToMrkdwn
