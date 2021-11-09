import * as ohm from "ohm-js";
import { removeEmptyNotes } from "./AnkiConnect";

export function regexPraser(input: string) : RegExp {
    if (typeof input !== "string") {
        throw new Error("Invalid input. Input must be a string");
    }
    // Parse input
    var m = input.match(/(\/)(.+)\1([a-z]*)/i);
    // Invalid input (input not in format /regex/i)
    if(m == null) throw "Input string is not in required format for conversion to regex.";
    // Invalid flags
    if (m[3] && !/^(?!.*?(.).*?\1)[gmixXsuUAJ]+$/.test(m[3])) {
        return RegExp(input);
    }
    // Create the regular expression
    return new RegExp(m[2], m[3]);
}

export function string_to_arr(str: string) : any {
    let r = [];

    // Define and match the grammer
    const grammer = ohm.grammar(String.raw`
    StrRegArray {
        Exp = listOf<StrOrRegex, separator> separator*
        separator = "," (whitespace)*
        StrOrRegex = (Regex | Str)
        Str = "\'" seqStr "\'"
        Regex =  "/" seqReg "/" (letter|lineTerminator)*
        seqReg = (("\\/" |"\\\\"|~("/")  any))+
        seqStr = (("\\\\"|"\\'"| ~("\'")  any))*
            
        // External rules
        whitespace = "\t"
                   | "\x0B"    -- verticalTab
                   | "\x0C"    -- formFeed
                   | " "
                   | "\u00A0"  -- noBreakSpace
                   | "\uFEFF"  -- byteOrderMark
                   | unicodeSpaceSeparator
         unicodeSpaceSeparator = "\u2000".."\u200B" | "\u3000"
         lineTerminator = "\n" | "\r" | "\u2028" | "\u2029"
      }`);
    let matchResult = grammer.match(str);
    if(matchResult.failed()) {throw "Cannot parse array list from string"; return r;}

    // Define and assciate semantic actions with grammar
    const actions = {
    Exp(a,b) { a.myOperation();b.myOperation(); },
    nonemptyListOf(a,b,c) { a.myOperation();c.myOperation(); },
    _iter(...a) { for (let b of a) b.myOperation();},
    separator(a, b) {},
    StrOrRegex(a) { a.myOperation(); },
    Regex(a,b,c,d) { r.push(regexPraser(this.sourceString)) },
    Str(a,b,c) { r.push(this.children[1].sourceString) },
    }
    const s = grammer.createSemantics();
    s.addOperation('myOperation', actions);
    s(matchResult).myOperation();
    return r;
}
