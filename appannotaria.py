# -*- coding: utf-8 -*-
"""
	annotaria webserver
"""
from flask import Flask, jsonify, json, render_template, request, Response, abort, redirect, url_for
import sys
import os
import annotaria

app = Flask(__name__)

dirname, filename = os.path.split(os.path.abspath(__file__))
logfile = dirname + "/flask.log";

# Set local paths
dir_local = os.path.dirname(__file__)
dir_TripleStore = os.path.join(dir_local, 'TripleStore/')
sys.path.append(dir_TripleStore)

# Set path for TripleStore
path = os.path.join(dir_TripleStore, "rdf-store.ttl")

# Initialize TripleStore obj and open TripleStore
#store = annotaria.LocalStore(path)
store = annotaria.RemoteStore()

if not app.debug:
	import logging
	from logging import FileHandler
	file_handler = FileHandler(logfile, mode='a', encoding=None, delay=False)
	file_handler.setLevel(logging.WARNING)
	app.logger.addHandler(file_handler)

# Get methods
@app.route('/wsgi/getDocuments')
@app.route('/getDocuments')
def getDocuments():
	return jsonify(root=store.getDocuments())

@app.route('/wsgi/getAllDocuments')
@app.route('/getAllDocuments')
def getAllDocuments():
	return jsonify(root=store.getAllDocuments())

@app.route('/wsgi/getGlobalAnnotations')
@app.route('/getGlobalAnnotations')
def getAnnotations():
	uri = request.args.get('uri', '', type=str)
	return jsonify(annotations=store.getGlobalAnnotations(uri))

@app.route('/wsgi/getLocalAnnotations')
@app.route('/getLocalAnnotations')
def getLocalAnnotations():
	uri = request.args.get('uri', '', type=str)
	return jsonify(annotations=store.getLocalAnnotations(uri))

@app.route('/wsgi/getPublishers')
@app.route('/getPublishers')
def getPublishers():
	return jsonify(root=store.getPublishers())

@app.route('/wsgi/getPeople')
@app.route('/getPeople')
def getPeople():
	return jsonify(root=store.getPeople())

@app.route('/wsgi/getPlaces')
@app.route('/getPlaces')
def getPlaces():
	return jsonify(root=store.getPlaces())

@app.route('/wsgi/getDiseases')
@app.route('/getDiseases')
def getDiseases():
	return jsonify(root=store.getDiseases())

@app.route('/wsgi/getSubjects')
@app.route('/getSubjects')
def getSubjects():
	return jsonify(root=store.getSubjects())

@app.route('/wsgi/findPerson')
@app.route('/findPerson')
def findPerson():
	email = request.args.get('email')
	return jsonify(root=store.findPerson(email))

@app.route('/wsgi/getAnnotators')
@app.route('/getAnnotators')
def getAnnotators():
	return jsonify(root=store.getAnnotators())

# POST methods
@app.route('/wsgi/addAnnotator', methods=['POST'])
@app.route('/addAnnotator', methods=['POST'])
def addAnnotator():
	uri = request.get_json().get('uri')
	name = request.get_json().get('name')
	email = request.get_json().get('email')
	return jsonify(root=store.addAnnotator(uri, name, email))

@app.route('/wsgi/addPerson', methods=['POST'])
@app.route('/addPerson', methods=['POST'])
def addPerson():
	name = request.get_json().get('name')
	uri = request.get_json().get('uri')
	return jsonify(root=store.addPerson(name, uri))

@app.route('/wsgi/addDocument', methods=['POST'])
@app.route('/addDocument', methods=['POST'])
def addDocument():
	name = request.get_json().get('name')
	uri = request.get_json().get('uri')
	return jsonify(root=store.addDocument(name, uri))

@app.route('/wsgi/addPlace', methods=['POST'])
@app.route('/addPlace', methods=['POST'])
def addPlace():
	name = request.get_json().get('name')
	uri = request.get_json().get('uri')
	return jsonify(root=store.addPlace(name, uri))

@app.route('/wsgi/addSubject', methods=['POST'])
@app.route('/addSubject', methods=['POST'])
def addSubject():
	name = request.get_json().get('name')
	uri = request.get_json().get('uri')
	return jsonify(root=store.addSubject(name, uri))

@app.route('/wsgi/addPublisher', methods=['POST'])
@app.route('/addPublisher', methods=['POST'])
def addPublisher():
	name = request.get_json().get('name')
	uri = request.get_json().get('uri')
	return jsonify(root=store.addPublisher(name, uri))  

@app.route('/wsgi/addGlobalAnnotation', methods=['POST'])
@app.route('/addGlobalAnnotation', methods=['POST'])
def addGlobalAnnotation():
	annotationLabel = request.get_json().get('annotationLabel')
	annotationType = request.get_json().get('annotationType')
	annotationTime = request.get_json().get('annotationTime')
	annotationTarget = request.get_json().get('annotationTarget')
	annotator = request.get_json().get('annotator')
	bodyObject = request.get_json().get('bodyObject')
	bodyPredicate = request.get_json().get('bodyPredicate')
	bodySubject = request.get_json().get('bodySubject')
	bodyLabel = request.get_json().get('bodyLabel')
	return jsonify(root=store.addGlobalAnnotation(annotationLabel, annotationType, annotationTime, annotationTarget, annotator, bodyObject, bodyPredicate, bodySubject, bodyLabel))  

@app.route('/wsgi/addLocalAnnotation', methods=['POST'])
@app.route('/addLocalAnnotation', methods=['POST'])
def addLocalAnnotation():
	annotationLabel = request.get_json().get('annotationLabel')
	annotationType = request.get_json().get('annotationType')
	annotationTime = request.get_json().get('annotationTime')
	annotationTarget = request.get_json().get('annotationTarget')
	annotator = request.get_json().get('annotator')
	bodyObject = request.get_json().get('bodyObject')
	bodyPredicate = request.get_json().get('bodyPredicate')
	bodySubject = request.get_json().get('bodySubject')
	bodyLabel = request.get_json().get('bodyLabel')
	fragmentId = request.get_json().get('fragmentId')
	fragmentStart = request.get_json().get('fragmentStart')
	fragmentEnd = request.get_json().get('fragmentEnd')
	return jsonify(root=store.addLocalAnnotation(annotationLabel, annotationType, annotationTime, annotationTarget, annotator, bodyObject, bodyPredicate, bodySubject, bodyLabel, fragmentId, fragmentStart, fragmentEnd))

@app.route('/wsgi/documentMetadata')
@app.route('/documentsMetadata')
def documentMetadata():
	"""Return document metadata"""
	docname = request.args.get('docname', '', type=str)
	return jsonify(result="documentsMetadata")

@app.route('/wsgi/metadataClass')
@app.route('/metadataClass')
def metadataClass():
	"""Return metadata class"""
	classtype = request.args.get('classtype', 'none', type=str)
	return jsonify(result="metadataClass", classtype=classtype)

@app.route('/images/<path:imagepath>')
def image(imagepath):
	return redirect("http://annotaria.web.cs.unibo.it/documents/images/"+imagepath, code=301)

@app.route('/jats-preview.css')
def jats_preview():
	return app.send_static_file('css/jats-preview.css')

@app.route('/')
def index():
	return app.send_static_file('index.html')

if __name__ == '__main__':
#	app.debug = True
	app.run()
