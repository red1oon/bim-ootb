#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — Scope: prompts/FILM_DXF2BIM_BRICSCAD.md. Renders DXF sheets as 1920x1080 dark-theme PNGs (ezdxf drawing add-on + matplotlib) for the film, with the text entities that match
# a REDACTION REGEX removed (a title block can carry a client's name: NEVER put that name in a repo, so the pattern comes from the environment / argument).
# usage: FILM_REDACT_RE='<regex>' film_dxf2bim_render_sheets.py <outDir> <name=file.dxf> ...     (e.g. floor_plan=.../0_FLOOR_PLAN.dxf)
# Prints §RENDER lines: per sheet the number of redacted text entities and a check that none of the pattern remains in what was drawn. Exit 1 if the pattern is missing (no redaction would be a silent leak).
import os, re, sys
import ezdxf
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from ezdxf.addons.drawing import Frontend, RenderContext
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
from ezdxf.addons.drawing.properties import LayoutProperties
rx = os.environ.get('FILM_REDACT_RE')
if not rx: sys.exit('§RENDER ERROR FILM_REDACT_RE is not set (the pattern for the text to filter out; it is never stored in the repo)')
pat = re.compile(rx, re.I)
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
text_of = lambda e: e.dxf.text if e.dxftype() == 'TEXT' else (e.text if e.dxftype() == 'MTEXT' else None)
for spec in sys.argv[2:]:
    name, f = spec.split('=', 1)
    d = ezdxf.readfile(f); msp = d.modelspace(); dropped = []
    def keep(e):
        t = text_of(e)
        if t and pat.search(t): dropped.append(t); return False
        return True
    fig = plt.figure(figsize=(16, 9), dpi=120); ax = fig.add_axes([0, 0, 1, 1]); ax.set_facecolor('#14161c'); fig.patch.set_facecolor('#14161c')
    props = LayoutProperties.from_layout(msp); props.set_colors('#14161c')
    Frontend(RenderContext(d), MatplotlibBackend(ax)).draw_layout(msp, layout_properties=props, filter_func=keep)
    ax.set_aspect('equal'); ax.autoscale(); ax.margins(0.03); ax.axis('off')
    fig.savefig(os.path.join(out, name + '.png'), facecolor=fig.get_facecolor()); plt.close(fig)
    # leak check over EVERYTHING drawn that can carry text (TEXT/MTEXT kept by the filter, DIMENSION text overrides, ATTRIB/ATTDEF, blocks inserted in the layout): a match here would be on screen
    def all_texts(e):
        t = e.dxftype()
        if t in ('TEXT', 'MTEXT'): return [] if pat.search(text_of(e) or '') else [text_of(e)]
        if t == 'DIMENSION': return [e.dxf.get('text', '')]
        if t in ('ATTRIB', 'ATTDEF'): return [e.dxf.get('text', '')]
        if t == 'INSERT':
            out_t = []
            for b in d.blocks.get(e.dxf.name, []) if e.dxf.name in d.blocks else []: out_t += all_texts(b)
            for a in getattr(e, 'attribs', []): out_t += [a.dxf.get('text', '')]
            return out_t
        return []
    shown = [t for e in msp for t in all_texts(e) if t]
    leaks = [t for t in shown if pat.search(t)]
    print('§RENDER %s redacted=%d texts_drawn=%d pattern_in_drawn_text=%d' % (name, len(dropped), len(shown), len(leaks)), flush=True)
    if leaks: sys.exit('§RENDER FAIL the pattern is still in what would be drawn: ' + name)
