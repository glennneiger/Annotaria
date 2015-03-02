# -*- coding: utf-8 -*-
import sys

# Activate virtual environment
activate_this = '/var/www/people/ltw1401/data/venv/bin/activate_this.py'
execfile(activate_this, dict(__file__=activate_this))

sys.path.insert(0, '/var/www/people/ltw1401/html/')
from appannotaria import app as application
