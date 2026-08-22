#!/usr/bin/env python3
"""Regenerate all Tiancode icons and logo assets from the brand emblem.

Aliases to regenerate-icons.py
"""

import os
import runpy

if __name__ == "__main__":
    # El archivo destino lleva guion ("regenerate-icons.py"), por lo que no es
    # importable como módulo; se ejecuta por ruta.
    runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), "regenerate-icons.py"), run_name="__main__")
