import hljs from "highlight.js";
import path from "path";
import * as AnkiConnect from './anki-connect/AnkiConnect';
import '@logseq/libs';
import * as cheerio from 'cheerio';
import { decodeHTMLEntities, getRandomUnicodeString, safeReplace, safeReplaceAsync } from './utils';
import _ from 'lodash';
import { Mldoc } from 'mldoc';
import { Note } from './types'

let mldocsOptions = {
    "toc": false,
    "heading_number": false,
    "keep_line_break": false,
    "format": "Markdown",
    "heading_to_list": false,
    "exporting_keep_properties": false,
    "inline_type_with_pos": true,
    "parse_outline_only": false,
    "export_md_remove_options": [],
    "hiccup_in_block": true
};

function orgToHtml(result: string) {
    let parsedJson = Mldoc.parseInlineJson(
        result,
        JSON.stringify(mldocsOptions),
        JSON.stringify({})
    );
    result = Mldoc.export("html", result,
        JSON.stringify(mldocsOptions),
        JSON.stringify({})
    );
    return prettifyHtml(result)
}

export function noteToHtml(note: Note): Note {
    const copyNote = Object.assign(note, {})
    const { fields } = copyNote
    mldocsOptions.format = "Org"
    Object.keys(fields).forEach((key) => {
        fields[key] = orgToHtml(fields[key].trim())
    })
    return copyNote
}

function prettifyHtml(result: string): string {
    let $ = cheerio.load(result, { decodeEntities: false });
    $('pre code').each(function (_, ele) { // Syntax hightlight block code (block codes are preceded by pre)
        $(ele).addClass("hljs");
        if (ele.attribs["data-lang"]) {
            $(ele).html(hljs.highlight(ele.attribs["data-lang"], $(ele).html()).value.replace(/\n$/, ""));
        } else {
            $(ele).html(hljs.highlightAuto($(ele).html()).value.replace(/\n$/, ""))
        };
    });
    return decodeHTMLEntities(decodeHTMLEntities($('#content ul li').html() || "")).trim();
}

export async function convertLogseqToHtml(content: string, format: string = "markdown"): Promise<string> {
    let result = content;
    if (logseq.settings.converterDebug) console.log("--Start Converting--\nOriginal:", result);

    result = await processProperties(result, format);
    result = await processEmbeds(result, format);
    if (logseq.settings.converterDebug) console.log("After processing embeded:", result);

    if (format == "org") {
        mldocsOptions.format = "Org";
    } else mldocsOptions.format = "Markdown";

    // --- Hacky fix for inline html support and {{c\d+:: content}} marcos using hashmap ---
    let hashmap = {};

    // Put all html content in hashmap
    let parsedJson = Mldoc.parseInlineJson(result,
        JSON.stringify({...mldocsOptions, "parse_outline_only": true}),
        JSON.stringify({})
    );
    try { parsedJson = JSON.parse(parsedJson); } catch { parsedJson = []; };
    let resultUTF8 = new TextEncoder().encode(result);  // Convert to utf8 array as mldocs outputs position according to utf8 https://github.com/logseq/mldoc/issues/120
    for (let i = parsedJson.length - 1; i >= 0; i--) {
        // node's start_pos is bound to be larger than next item's end_pos due to how Mldoc.parseInlineJson works
        let node = parsedJson[i];
        if (node[node.length - 1]["start_pos"] == null) continue;
        if (node[0][0] == null) continue;

        let type = node[0][0];
        let content = node[0][1];
        let start_pos = node[node.length - 1]["start_pos"];
        let end_pos = node[node.length - 1]["end_pos"];
        if (type == "Raw_Html" || type == "Inline_Html") {
            if (content != new TextDecoder().decode(resultUTF8.slice(start_pos, end_pos))) {
                console.error("Error: content mismatch", content, result.substring(start_pos, end_pos));
            }
            let str = getRandomUnicodeString();
            hashmap[str] = new TextDecoder().decode(resultUTF8.slice(start_pos, end_pos));
            resultUTF8 = new Uint8Array([...resultUTF8.subarray(0, start_pos), ...new TextEncoder().encode(str), ...resultUTF8.subarray(end_pos)]);
        }
    }
    result = new TextDecoder().decode(resultUTF8);

    // Put all anki cloze marcos in hashmap
    result = result.replace(/(\{\{c(\d+)::)((.|\n)*?)\}\}/g, (match, g1, g2, g3, ...arg) => {
        let strFront = getRandomUnicodeString();
        let strBack = getRandomUnicodeString();

        // temportary fix: cloze end charecters }} getting deleted after code block ends
        if (g3.trim().endsWith("```")) {
            g3 = `${g3}\n`;
        }

        // fix: if there is a newline before cloze, we need to add new line after hash charecters
        let charecter_before_match = result.substring(result.indexOf(match) - 1, result.indexOf(match));
        if ((charecter_before_match == "\n" || charecter_before_match == "") && (g3.match(/^\s*?\$\$/g) || g3.match(/^\s*?#\+/g)))
            g3 = `\n${g3}`;
        hashmap[strFront] = g1;
        hashmap[strBack] = "}}";
        return `${strFront}${g3}${strBack}`;
    });
    if (logseq.settings.converterDebug) console.log("After replacing errorinous terms:", result);

    // Render the markdown
    result = Mldoc.export("html", result,
        JSON.stringify(mldocsOptions),
        JSON.stringify({})
    );
    // Render images and and codes
    let $ = cheerio.load(result, { decodeEntities: false });
    const isImage = /^.*\.(png|jpg|jpeg|bmp|tiff|gif|apng|svg|webp)$/i;
    const isWebURL = /^(https?:(\/\/)?(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:(\/\/)?(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})$/i;
    let graphPath = (await logseq.App.getCurrentGraph()).path;
    $('pre code').each(function (i, elm) { // Syntax hightlight block code (block codes are preceded by pre)
        $(elm).addClass("hljs");
        if (elm.attribs["data-lang"]) {
            $(elm).html(hljs.highlight(elm.attribs["data-lang"], $(elm).html()).value.replace(/\n$/, ""));
        } else $(elm).html(hljs.highlightAuto($(elm).html()).value.replace(/\n$/, ""));
    });
    $('img').each(function (i, elm) {   // Handle images
        if ((encodeURI(elm.attribs.src).match(isImage) && !encodeURI(elm.attribs.src).match(isWebURL))) {
            try {
                let imgPath = path.join(graphPath, path.resolve(elm.attribs.src));
                AnkiConnect.storeMediaFileByPath(encodeURIComponent(elm.attribs.src), imgPath); // Flatten image path and save in anki
            } catch (e) { console.warn(e); }
            elm.attribs.src = encodeURIComponent(elm.attribs.src); // Flatten image path
        }
        else elm.attribs.src = elm.attribs.src.replace(/^http(s?):\/?\/?/i, "http$1://"); // Fix web image path
    });
    $('.mathblock, .latex-environment').each(function (i, elm) {    // Handle org math and latex-environment blocks
        let math = $(elm).html();
        // Remove all types of math braces in math
        math = math.replace(/\\\[([\s\S]*?)\\\]/g, "$1");
        math = math.replace(/\$\$([\s\S]*?)\$\$/g, "$1");

        // Add block math braces in math
        $(elm).html(`\\[ ${math} \\]`);
    });
    result = decodeHTMLEntities(decodeHTMLEntities($('#content ul li').html() || ""));
    if (logseq.settings.converterDebug) console.log("After Mldoc.export:", result);

    // Bring back inline html content and clozes from hashmap
    for (let key in hashmap) {
        result = safeReplace(result, key, hashmap[key]);
    }

    if (logseq.settings.converterDebug) console.log("After bringing back errorinous terms:", result, "\n---End---");
    return result;
}

async function processProperties(content: string, format: string = "markdown"): Promise<string> {
    let result = content;
    result = safeReplace(result, /^\s*(\w|-)*::.*\n?\n?/gm, ""); //Remove md properties
    result = safeReplace(result, /:PROPERTIES:\n((.|\n)*?):END:\n?/gm, ""); //Remove org properties
    return result;
}


async function processEmbeds(content: string, format: string = "markdown"): Promise<string> {
    let result = content;

    result = await safeReplaceAsync(result, /\{\{embed \(\((.*?)\)\) *?\}\}/gm, async (match, g1) => {  // Convert block embed
        let block_content = "";
        try { let block = await logseq.Editor.getBlock(g1); block_content = _.get(block, "content").replace(/(\{\{c(\d+)::)((.|\n)*?)\}\}/g, "$3").replace(/(?<!{{embed [^}\n]*?)}}/g, "} } ") || ""; } catch (e) { console.warn(e); }
        return `<div class="embed-block">
                <ul class="children-list"><li class="children">${await convertLogseqToHtml(block_content, format)}</li></ul>
                </div>`;
    });

    result = await safeReplaceAsync(result, /\{\{embed \[\[(.*?)\]\] *?\}\}/gm, async (match, g1) => { // Convert page embed
        let pageTree = [];
        let getPageContentHTML = async (children: any, level: number = 0) => {
            if (level >= 100) return "";
            let result = `\n<ul class="children-list">`;
            for (let child of children) {
                result += `\n<li class="children">`;
                let block_content = _.get(child, "content").replace(/(\{\{c(\d+)::)((.|\n)*?)\}\}/g, "$3").replace(/(?<!{{embed [^}\n]*?)}}/g, "} } ") || "";
                let format = _.get(child, "format") || "markdown";
                let html = await convertLogseqToHtml(block_content, format);
                if (child.children.length > 0) html += await getPageContentHTML(child.children, level + 1);

                result += html;
                result += `</li>`;
            }
            result += `</ul>`;
            return result;
        }
        try { pageTree = await logseq.Editor.getPageBlocksTree(g1); } catch (e) { console.warn(e); }

        return `<div class="embed-page">
                <a href="#${g1}" class="embed-header">${g1}</a>
                ${await getPageContentHTML(pageTree)}
                </div>`;
    });

    result = safeReplace(result, /\[\[(.*?)\]\]/gm, `<a href="#$1" class="page-reference">$1</a>`); // Convert page refs
    result = safeReplace(result, /\[(.*?)\]\(\(\((.*?)\)\)\)/gm, `<span class="block-ref">$1</span>`); // Convert block ref link
    result = await safeReplaceAsync(result, /\(\((.*?)\)\)/gm, async (match, g1) => { // Convert block refs
        let block;
        try { block = await logseq.Editor.getBlock(g1); }
        catch (e) { console.warn(e); }
        if (_.get(block, "properties.lsType") == "annotation" && _.get(block, "properties.hlType") == "area") {  // Pdf area ref
            let page = await logseq.Editor.getPage(block.page.id);
            let hls_img_loc = `../assets/${_.get(page, "originalName", "").replace("hls__", "")}/${_.get(block, "properties.hlPage")}_${g1}_${_.get(block, "properties.hlStamp")}.png`;
            await convertLogseqToHtml(`![](${hls_img_loc})`, "markdown");
            let img_html = `<img src="${encodeURIComponent(hls_img_loc)}" />`
            return `<span class="block-ref">\ud83d\udccc<strong>P${_.get(block, "properties.hlPage")}</strong> <br/> ${img_html}</span>`;
        }
        else if (_.get(block, "properties.lsType") == "annotation") {    // Pdf text ref
            let block_content = _.get(block, "content");
            block_content = safeReplace(block_content, /^\s*(\w|-)*::.*\n?\n?/gm, "");
            block_content = safeReplace(block_content, /:PROPERTIES:\n((.|\n)*?):END:\n?/gm, "");
            return `<span class="block-ref">\ud83d\udccc<strong>P${_.get(block, "properties.hlPage")}</strong> ${block_content}</span>`;
        }
        // Normal Block ref
        try {
            let block_content = block.content;
            block_content = safeReplace(block_content, /^\s*(\w|-)*::.*\n?\n?/gm, "");
            block_content = safeReplace(block_content, /:PROPERTIES:\n((.|\n)*?):END:\n?/gm, "");
            let block_content_first_line = block_content.split("\n").find(line => line.trim() != "");
            return `<span class="block-ref">${block_content_first_line}</span>`;
        }
        catch (e) { // Block not found
            console.warn(e);
            return `<span class="failed-block-ref">${g1}</span>`;
        }
    });

    return result;
}
