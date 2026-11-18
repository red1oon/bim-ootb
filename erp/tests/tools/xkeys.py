#!/usr/bin/env python3
# send keys to the CURRENT $DISPLAY (an Xvfb) with XTEST; refuses to run on anything but a display named in XKEYS_ALLOW (the virtual one)
import ctypes, os, sys, time
d = os.environ.get('DISPLAY', ''); 
if os.environ.get('XKEYS_ALLOW') != d: sys.exit('refusing: DISPLAY %r is not the virtual display %r' % (d, os.environ.get('XKEYS_ALLOW')))
X = ctypes.CDLL('libX11.so.6'); T = ctypes.CDLL('libXtst.so.6')
X.XOpenDisplay.restype = ctypes.c_void_p; X.XStringToKeysym.restype = ctypes.c_ulong; X.XKeysymToKeycode.restype = ctypes.c_ubyte
dpy = X.XOpenDisplay(None); assert dpy, 'no display'
def kc(name): return X.XKeysymToKeycode(ctypes.c_void_p(dpy), ctypes.c_ulong(X.XStringToKeysym(name.encode())))
def press(name, mods=()):
    for m in mods: T.XTestFakeKeyEvent(ctypes.c_void_p(dpy), kc(m), 1, 0)
    T.XTestFakeKeyEvent(ctypes.c_void_p(dpy), kc(name), 1, 0); T.XTestFakeKeyEvent(ctypes.c_void_p(dpy), kc(name), 0, 0)
    for m in reversed(mods): T.XTestFakeKeyEvent(ctypes.c_void_p(dpy), kc(m), 0, 0)
    X.XFlush(ctypes.c_void_p(dpy)); time.sleep(0.12)
names = {'/': 'slash', '_': 'underscore', '.': 'period', '-': 'minus', ' ': 'space', '~': 'asciitilde'}
for a in sys.argv[1:]:
    if a.startswith('text:'):
        for ch in a[5:]:
            nm = names.get(ch, ch); shift = ch.isupper() or ch in '_~'
            press(nm, ('Shift_L',) if shift else ())
    else:
        parts = a.split('+'); press(parts[-1], tuple({'ctrl': 'Control_L', 'alt': 'Alt_L', 'shift': 'Shift_L'}[p] for p in parts[:-1]))
