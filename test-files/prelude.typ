#let meta(..args) = metadata(args)
#let note(body) = {
  set text(font: ("Source Han Sans SC", "Times New Roman"), size: 16pt, region: "cn")
  set page(height: auto)
  show regex("\[\[.+\]\]"): it => {
    set text(fill: blue)
    link("")[#str(it.text).trim("[").trim("]")]
  }

  body
}
