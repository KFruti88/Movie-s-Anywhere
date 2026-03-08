import pandas as pd
import datetime
import os
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom

# Your Google Sheet CSV URL
CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRbnwK6U18P1u1eAS8a_PqZzpOKxQ9AATL6RBH7CfxXQR10YPM63akRqxSDbNiXYJWs92tvobh6iqE7/pub?output=csv'
SITE_URL = 'https://kfruti88.github.io/Movies-Anywhere/' 
FEED_FILENAME = 'feed.xml'

def get_val_case_insensitive(row, target_key):
    """Finds a value in a row regardless of column name spacing or symbols."""
    clean_target = "".join(filter(str.isalnum, target_key.lower()))
    for key in row.index:
        if "".join(filter(str.isalnum, str(key).lower())) == clean_target:
            return row[key]
    return None

def generate_rss():
    try:
        print("Fixin' to fetch the CSV from Google Sheets...")
        # Load the CSV data
        df = pd.read_csv(CSV_URL)
        
        # Filter out any rows that don't have a name
        # We look for the 'Name' column dynamically
        name_col = None
        for col in df.columns:
            if "".join(filter(str.isalnum, str(col).lower())) == 'name':
                name_col = col
                break
        
        if not name_col:
            print("Dern it! Couldn't find a 'Name' column in your sheet.")
            return

        # Drop rows where Name is empty
        df = df.dropna(subset=[name_col])
        df = df[df[name_col].str.strip() != ""]

        # RSS feeds usually show the newest items first. 
        # Since new movies are added to the bottom of the sheet, we reverse it.
        # We'll take the last 50 movies so the feed doesn't get uselessly long.
        recent_movies = df.tail(50).iloc[::-1]

        # Create the RSS Root
        rss = Element('rss', {
            'version': '2.0', 
            'xmlns:atom': 'http://www.w3.org/2005/Atom'
        })
        
        channel = SubElement(rss, 'channel')
        
        # Channel Metadata
        SubElement(channel, 'title').text = "Werewolf3788 Cinema Library - New Additions"
        SubElement(channel, 'link').text = SITE_URL
        SubElement(channel, 'description').text = "Latest movie names added to the Movies Anywhere Universal Hub."
        SubElement(channel, 'language').text = 'en-us'
        SubElement(channel, 'lastBuildDate').text = datetime.datetime.now().strftime("%a, %d %b %Y %H:%M:%S +0000")

        # Add an Atom link for better compatibility
        SubElement(channel, 'atom:link', {
            'href': f"{SITE_URL}{FEED_FILENAME}",
            'rel': 'self',
            'type': 'application/rss+xml'
        })

        print(f"Processin' {len(recent_movies)} movies for the feed...")

        for index, row in recent_movies.iterrows():
            movie_name = str(row[name_col]).strip()
            
            # Create Item
            item = SubElement(channel, 'item')
            SubElement(item, 'title').text = movie_name
            SubElement(item, 'link').text = SITE_URL
            
            # description shows the movie name clearly
            description_text = f"New Movie Added: {movie_name}"
            SubElement(item, 'description').text = description_text
            
            # GUID is unique for each movie name to prevent duplicate notifications
            SubElement(item, 'guid', {'isPermaLink': 'false'}).text = f"movie-{hash(movie_name)}"
            
            # Since Sheets doesn't have a 'Date Added' column by default, 
            # we use the current time for the feed generation.
            SubElement(item, 'pubDate').text = datetime.datetime.now().strftime("%a, %d %b %Y %H:%M:%S +0000")

        # Pretty print the XML
        xml_string = tostring(rss, encoding='utf-8')
        pretty_xml = minidom.parseString(xml_string).toprettyxml(indent="  ")

        # Write to file
        with open(FEED_FILENAME, "w", encoding="utf-8") as f:
            f.write(pretty_xml)
            
        print(f"Success! {FEED_FILENAME} has been gussied up and is ready to skiddaddle.")

    except Exception as e:
        print(f"Well, I'll be a monkey's uncle... an error occurred: {e}")

if __name__ == "__main__":
    generate_rss()
