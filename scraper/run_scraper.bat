@echo off
cd /d "%~dp0"
echo Running APEX scraper...
python scraper/apex_scraper.py
echo Done.
