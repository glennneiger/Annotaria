import annotaria
import json
import logging
import os
import sys
import rdflib
import urllib
from rdflib import Literal, BNode, URIRef
from rdflib.namespace import FOAF, DC, RDF, RDFS, XSD
from rdflib.plugins import sparql
from SPARQLWrapper import SPARQLWrapper, JSON

# Define a dictionary of namespaces
ns = {}
ns['ao']       = "http://vitali.web.cs.unibo.it/AnnOtaria/"
ns['aop']      = "http://vitali.web.cs.unibo.it/AnnOtaria/person/"
ns['cito']     = "http://purl.org/spar/cito/"
ns['dbpedia']  = "http://dbpedia.org/resource/"
ns['dcterms']  = "http://purl.org/dc/terms/"
ns['fabio']    = "http://purl.org/spar/fabio/"
ns['oa']       = "http://www.w3.org/ns/oa#"
ns['skos']     = "http://www.w3.org/2004/02/skos/core#"
ns['schema']   = "http://schema.org/"
ns['skos']     = "http://www.w3.org/2004/02/skos/core#"

# Define namespaces
FABIO   = rdflib.Namespace("http://purl.org/spar/fabio/")
AO      = rdflib.Namespace(ns['ao'])
OA      = rdflib.Namespace(ns['oa'])
SCHEMA  = rdflib.Namespace(ns['schema'])
XSD     = rdflib.Namespace("http://www.w3.org/2001/XMLSchema#")
AOP     = rdflib.Namespace(ns['aop'])
DCTERMS = rdflib.Namespace("http://purl.org/dc/terms/")
FRBR    = rdflib.Namespace("http://purl.org/vocab/frbr/core#")

class Connection(object):
	def __init__(self, prefixes={}):
		self.sparqlGet = SPARQLWrapper("http://giovanna.cs.unibo.it:8181/data/query", returnFormat="json")
		self.sparqlPost = SPARQLWrapper("http://giovanna.cs.unibo.it:8181/data/update", returnFormat="json")
		self.prefixes =	{
			"ao"		: "http://vitali.web.cs.unibo.it/AnnOtaria/",
			"aop"		: "http://vitali.web.cs.unibo.it/AnnOtaria/person/",
			"au"		: "http://description.org/schema/",
			"bif"		: "http://www.openlinksw.com/schema/sparql/extensions#",
			"cito"		: "http://purl.org/spar/cito/",
			"dbpedia"	: "http://dbpedia.org/resource/",
			"dcterms"	: "http://purl.org/dc/terms/",
			"fabio"		: "http://purl.org/spar/fabio/",
			"foaf"		: "http://xmlns.com/foaf/0.1/",
			"frbr"		: "http://purl.org/vocab/frbr/core#",
			"oa"		: "http://www.w3.org/ns/oa#",
			"rdf"		: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
			"rdfs"		: "http://www.w3.org/2000/01/rdf-schema#",
			"schema"	: "http://schema.org/",
			"sem"		: "http://www.ontologydesignpatterns.org/cp/owl/semiotics.owl#",
			"skos"		: "http://www.w3.org/2004/02/skos/core#",
			"xml"		: "http://www.w3.org/XML/1998/namespace",
			"xsd"		: "http://www.w3.org/2001/XMLSchema#" }
		self.prefixes.update(prefixes)

	def queryGet(self, text):
		lines = ["PREFIX %s: <%s>" % (key, value) for key, value in self.prefixes.items()]
		lines.extend(text.split("\n"))
		query = "\n".join(lines)
		self.sparqlGet.setQuery(query)
		results = self.sparqlGet.query().convert()
		return results["results"]["bindings"]

	def queryPost(self, text):
		lines = ["PREFIX %s: <%s>" % (key, value) for key, value in self.prefixes.items()]
		lines.extend(text.split("\n"))
		query = "\n".join(lines)
		self.sparqlPost.setQuery(query)
		self.sparqlPost.method = 'POST'
		self.sparqlPost.query()

def translateNamespaces(uri):
	for key, value in ns.items():
		uri = uri.replace(key + ":", value)
	return uri

class RemoteStore(object):
	def __init__(self, prefixes={}):
		self.annotaria = Connection()

	'''
	Get Methods
	'''
	def getDocuments(self):
		results = self.annotaria.queryGet("""
SELECT ?expression ?item
WHERE
{
	?expression rdf:type fabio:Expression .
	?expression fabio:hasRepresentation ?item .
	FILTER(STRSTARTS(STR(?expression), "%s"))
}
""" % ns['ao'])

		expression = {}
		response = []
		for result in results:
			name = result['expression']['value'].split(ns['ao'])[1]
			if name in expression:
				continue
			expression[name] = True
			response.append({ 
				'name' : name,
				'uri' : result['item']['value']})
	
		return response

	def getAllDocuments(self):
		results = self.annotaria.queryGet("""
SELECT ?expression
WHERE
{
	?expression rdf:type fabio:Expression .
}
""")

		expression = {}
		response = []
		for result in results:
			name = result['expression']['value']
			if name in expression:
				continue
			expression[name] = True
			response.append({ 'name' : name, 'uri' : name })
	
		return response

	def getGlobalAnnotations(self, document):
		results = self.annotaria.queryGet("""
		SELECT ?type ?name ?email ?time ?label ?object ?predicate ?subject ?value
		WHERE
		{
			?annotation oa:hasTarget <%s> .
			?annotation ao:type ?type .
			?annotation rdfs:label ?label .
			?annotation oa:annotatedBy ?annotator .
			?annotation oa:annotatedAt ?time .
			?annotation oa:hasBody ?body .

			?annotator schema:email ?email .
			?annotator foaf:name ?name .

			?body rdf:object ?object .
			?body rdf:predicate ?predicate .
			?body rdf:subject ?subject .
			?body rdfs:label ?value .
		}""" % URIRef(document))

		answer = []
		for result in results:
			label = result['label']['value']
			name = result['name']['value']
			email = result['email']['value']
			time = result['time']['value']
			value = result['value']['value']
			answer.append({'type' : label, 'name' : name, 'email' : email, 'date' : time, 'value' : value});

		return answer

	def getLocalAnnotations(self, document):
		results = self.annotaria.queryGet("""
SELECT ?type ?label ?time ?object ?value ?annotator ?name ?email ?id ?start ?end
WHERE
{
	?annotation oa:hasTarget ?target .
	?annotation ao:type ?type .
	?annotation rdfs:label ?label .
	?annotation oa:annotatedBy ?annotator .
	?annotation oa:annotatedAt ?time .
	?annotation oa:hasBody ?body .

	?body rdf:subject ?subject .
	?body rdf:predicate ?predicate .
	?body rdf:object ?object .
	?body rdfs:label ?value .

	?target oa:hasSource <%s> .
	?target oa:hasSelector ?selector .

	?selector rdf:value ?id .
	?selector oa:start ?start .
	?selector oa:end ?end .

	?annotator schema:email ?email .
	?annotator foaf:name ?name .
}""" % URIRef(document))

		answer = []
		for result in results:
			answer.append({
				'type'           : result['type']['value'],
				'label'          : result['label']['value'],
				'time'           : result['time']['value'],
				'object'         : result['object']['value'],
				'value'          : result['value']['value'],
				'annotatorUri'   : result['annotator']['value'],
				'annotatorName'  : result['name']['value'],
				'annotatorEmail' : result['email']['value'],
				'id' 			 : result['id']['value'],
				'start'          : result['start']['value'],
				'end'            : result['end']['value']
				});

		return answer

	def getPeople(self):
		results = self.annotaria.queryGet("""
		SELECT DISTINCT ?uri ?name
		{
			?uri foaf:name ?name .
		}""")

		answer = []
		for result in results:
			answer.append({
				'name': result['name']['value'],
				'uri': 	result['uri']['value']});

		return answer

	def getPlaces(self):
		results = self.annotaria.queryGet("""
		SELECT DISTINCT ?uri ?name
		{
			?annotation ao:type "denotesPlace" .
			?annotation oa:hasBody ?body .

			?body rdf:object ?uri .
			?body rdfs:label ?name .
		}""")

		answer = []
		for result in results:
			answer.append({
				'name': result['name']['value'],
				'uri': 	result['uri']['value']});

		return answer

	def getDiseases(self):
		results = self.annotaria.queryGet("""
		SELECT DISTINCT ?uri ?name
		{
			?annotation ao:type "denotesDisease" .
			?annotation oa:hasBody ?body .

			?body rdf:object ?uri .
			?body rdfs:label ?name .    
		}""")

		answer = []
		for result in results:
			answer.append({
				'name': result['name']['value'],
				'uri': 	result['uri']['value']});

		return answer

	def getSubjects(self):
		results = self.annotaria.queryGet("""
		SELECT DISTINCT ?uri ?name
		{
			?annotation ao:type "hasSubject" .
			?annotation oa:hasBody ?body .

			?body rdf:object ?uri .
			?body rdfs:label ?name .    
		}""")

		answer = []
		for result in results:
			answer.append({
				'name': result['name']['value'],
				'uri': 	result['uri']['value']});

		return answer

	def getPublishers(self):
		results = self.annotaria.queryGet("""
		SELECT DISTINCT ?uri ?name
		{
			?uri a foaf:Organization .
			?uri foaf:name ?name .     
		}""")

		answer = []
		for result in results:
			publisher = {
				'name': result['name']['value'],
				'uri': result['uri']['value']
				}
			answer.append(publisher);

		return answer

	def findPerson(self, email):
		results = self.annotaria.queryGet("""
		SELECT ?uri ?name
		{
			?uri foaf:name ?name .
			?uri schema:email '%s' .        
		}""" % email)

		answer = []
		for result in results:
			answer.append({
				'name': result['name']['value'],
				'uri': 	result['uri']['value']});

		return answer

	def getAnnotators(self):
		results = self.annotaria.queryGet("""
		SELECT DISTINCT ?uri ?name ?email
		{
			?uri 	foaf:name ?name ;
					schema:email ?email .
		}""")

		answer = []
		for result in results:
			answer.append({
				'uri': 	result['uri']['value'],
				'name': result['name']['value'],
				'email': result['email']['value']});

		return answer

	'''
	Add Methods
	'''
	def addAnnotator(self, uri, name, email):
		self.annotaria.queryPost("""
			INSERT DATA {%s foaf:name '%s' ; schema:email '%s' .}""" % (uri, name, email))

		return { 'name' : name, 'uri' : uri, 'email' : email }

	def addPerson(self, name, uri):
		self.annotaria.queryPost("""
			INSERT DATA {%s foaf:name '%s' .}""" % (uri, name))

		return { 'name' : name, 'uri' : uri }

	def addDocument(self, name, uri):
		self.annotaria.queryPost("""
			INSERT DATA {%s rdf:type fabio:Expression .}""" % uri)
		return { 'name' : name, 'uri' : uri }

	def addPlace(self, name, uri):
		self.annotaria.queryPost("""
			INSERT DATA
			{
				%s 	a dbpedia:Place  ;
					rdfs:label '%s' .
			}""" % (uri, name))

		return { 'name' : name, 'uri' : uri }

	def addSubject(self, name, uri):
		self.annotaria.queryPost("""
			INSERT DATA
			{
				%s 	a skos:Concept  ;
					rdfs:label "%s" .
			}""" % (uri, name))

		return { 'name' : name, 'uri' : uri }

	def addPublisher(self, name, uri):
		self.annotaria.queryPost("""
			INSERT DATA
			{
				<%s> 	a foaf:Organization ;
						foaf:name '%s' .
			}""" % (uri, name))

		return { 'result' : 'ok' }

	def addGlobalAnnotation(self, annotationLabel, annotationType, annotationTime, annotationTarget, annotator, bodyObject, bodyPredicate, bodySubject, bodyLabel):
		if annotationType == "hasPublicationYear":
			bodyObject = '"' + bodyObject + '"^^xsd:gYear';
		elif annotationType == "hasAbstract" or annotationType == "hasTitle" or annotationType == "hasShortTitle" or annotationType == "hasComment":
			bodyObject = '"' + bodyObject+ '"^^xsd:string';
		elif bodyObject.find(':') == -1:
			bodyObject = "<" + bodyObject + ">";

		self.annotaria.queryPost("""
			INSERT DATA
			{
				[
					a 				oa:Annotation ;
					rdfs:label      "%s" ;
					ao:type 		"%s" ;
					oa:annotatedAt  "%s" ;
					oa:annotatedBy  <%s> ;
					oa:hasBody
					[
						a 				rdf:Statement ;
						rdf:object 		%s ;
						rdf:predicate  	%s ;
						rdf:subject 	<%s> ;
						rdfs:label 		"%s"
					] ;
					oa:hasTarget    <%s>
				] .
			}""" % (annotationLabel, annotationType, annotationTime, annotator, bodyObject, bodyPredicate, bodySubject, bodyLabel, annotationTarget))

		return { 'result' : 'ok' }

	def addLocalAnnotation(self, annotationLabel, annotationType, annotationTime, annotationTarget, annotator, bodyObject, bodyPredicate, bodySubject, bodyLabel, fragmentId, fragmentStart, fragmentEnd):
		print("\n" + bodyObject + "\n")
		if annotationType == "hasComment":
			bodyObject = '"' + bodyObject + '"^^xsd:string';
		elif annotationType == "hasFormattingScore" or annotationType == "hasOriginalityScore" or annotationType == "hasClarityScore":
			bodyObject = '"' + bodyObject + '"';
		elif annotationType == "relatesTo" or bodyObject.find(':') > -1:
			bodyObject = "<" + bodyObject + ">";
		print(bodyObject + "\n")
		self.annotaria.queryPost("""
INSERT DATA
{
[
	a oa:Annotation ;
	rdfs:label "%s" ;
	ao:type "%s" ;
	oa:annotatedAt "%s" ;
	oa:annotatedBy <%s> ;
	oa:hasBody
	[
		a rdf:Statement ;
		rdf:object %s ;
		rdf:predicate %s ;
		rdf:subject <%s> ;
		rdfs:label "%s"
	] ;
	oa:hasTarget
	[
		a oa:SpecificResource ;
		oa:hasSelector 
		[
			a oa:FragmentSelector ;
			rdf:value "%s" ;
			oa:start "%s"^^xsd:nonNegativeInteger ;
			oa:end "%s"^^xsd:nonNegativeInteger
		] ;
		oa:hasSource <%s>
	]
] .
}""" % (annotationLabel, annotationType, annotationTime, annotator, bodyObject, bodyPredicate, bodySubject, bodyLabel, fragmentId, fragmentStart, fragmentEnd, annotationTarget))

		return { 'result' : 'ok' }

class LocalStore(object):

	def __init__(self, path):
		'''Load the store content'''
		if not path:
			return "Insert 'path'."

		self.path = path
		self.store = rdflib.Graph()
		self.store.parse(self.path, format="turtle")

	def getDocuments(self):
		results = self.store.query("""
			SELECT ?expression ?item
			WHERE
			{
				?expression rdf:type fabio:Expression .
				?expression fabio:hasRepresentation ?item
			}""", initNs = { "rdf": RDF, "fabio": FABIO })
		response = []
		for tag in results:
			title = tag.expression.split(ns['doc'])[1]
			response.append({ 'title': title, 'uri': tag.item })
		return response

	def getAnnotations(self, document):
		# Prepare query
		query = sparql.prepareQuery("""
			SELECT ?type ?name ?email ?time ?label ?object ?predicate ?subject ?id ?start ?end
			WHERE
			{
				{ ?annotation oa:hasTarget ?document } UNION 
				{   
					?annotation oa:hasTarget ?target . 
					?target rdf:type oa:SpecificResource .
					?target oa:hasSelector ?selector .
					?target oa:hasSource ?document .
					?selector rdf:type oa:FragmentSelector .
					?selector rdf:value ?id .
					?selector oa:start ?start .
					?selector oa:end ?end .
				} .
				?annotation ao:type ?type .
				?annotation rdfs:label ?label .
				?annotation oa:annotatedBy ?annotator .
				?annotation oa:annotatedAt ?time .
				?annotation oa:hasBody ?body .
				?annotator schema:email ?email .
				?annotator foaf:name ?name .
				?body rdf:object ?object .
				?body rdf:predicate ?predicate .
				?body rdf:subject ?subject .
			}""", initNs = {'oa': OA, 'ao': AO, 'rdfs': RDFS, 'rdf': RDF, 'schema': SCHEMA, 'foaf': FOAF})

		# Fire query
		#results = self.store.query(query, initBindings={'document': URIRef(ns['doc'] + 'BMC_Bioinformatics_2008_Oct_1_9_406_ver1')})
		 #results = self.store.query(query, initBindings={'document': URIRef(ns['doc'] + document)})
		results = self.store.query(query, initBindings={'document': URIRef(document)})
		# Build the json
		theJSON = []
		for tag in results:
			"""annotation = {}
			annotation['type'] = tag.type
			body = {}
			body['subject'] = tag.subject
			body['predicate'] = tag.predicate
			body['object'] = tag.object
			annotation['body'] = body
			target = {}
			target['source'] = document
			if tag.id:
				target['id'] = tag.id
				target['start'] = tag.start
				target['end'] = tag.end
			provenance = {}
			provenance['author'] = {'name': tag.name, 'email': tag.email}
			provenance['time'] = tag.time"""

			#theJSON.append({'annotation': annotation, 'target': target, 'provenance': provenance})
			theJSON.append({'type' : tag.label, 'name' : tag.name, 'email' : tag.email, 'date' : tag.time, 'value' : tag.label});

		return theJSON

	def getLocalAnnotations(self, document):
		# Prepare the query
		query = sparql.prepareQuery("""
			SELECT ?type ?label ?name ?email ?time ?subject ?predicate ?object ?id ?start ?end
			WHERE
			{
				?annotation oa:hasTarget ?target .
				?annotation ao:type ?type .
				?annotation rdfs:label ?label .
				?annotation oa:annotatedBy ?annotator .
				?annotation oa:annotatedAt ?time .
				?annotation oa:hasBody ?body .

				?body rdf:subject ?subject .
				?body rdf:predicate ?predicate .
				?body rdf:object ?object .

				?target oa:hasSource ?document .
				?target oa:hasSelector ?selector .
				?target oa:hasSource ?document .

				?selector rdf:value ?id .
				?selector oa:start ?start .
				?selector oa:end ?end .

				?annotator schema:email ?email .
				?annotator foaf:name ?name .
			}""", initNs = {'oa': OA, 'ao': AO, 'rdfs': RDFS, 'rdf': RDF, 'schema': SCHEMA, 'foaf': FOAF})

		# Fire the query
		results = self.store.query(query, initBindings={'document': URIRef(document)})

		# Build the json
		theJSON = []
		for tag in results:
			body = { 'subject' : tag.subject, 'predicate' : tag.predicate, 'object' : tag.object }
			target = { 'id' : tag.id, 'start' : tag.start, 'end' : tag.end }
			author = { 'name': tag.name, 'email': tag.email }
			annotation = { 'type' : tag.type, 'label' : tag.label, 'time' : tag.time, 'body' : body, 'target' : target, 'author' : author }
			theJSON.append(annotation);

		return theJSON        

	def getAuthors(self):
		# Prepare query
		query = sparql.prepareQuery("""
			SELECT DISTINCT ?name ?email
			{
				?id foaf:name ?name .
				OPTIONAL { ?id schema:email ?email } .
				?annotation ao:type "hasAuthor" .
				?annotation oa:hasBody ?body .
				?body rdf:object ?id .          
			}""",
			initNs = { 'ao': AO, 'oa': OA, 'rdf': RDF, 'schema': SCHEMA, 'foaf': FOAF })

		# Fire query
		results = self.store.query(query)

		# Build the json
		theJSON = []
		for tag in results:
			author = {}
			author['name'] = tag.name
			if tag.email:
				author['email'] = tag.email

			theJSON.append(author)

		return json.dumps(theJSON, indent=4)

	def getAuthorInfo(self, author):
		# Prepare query
		query = sparql.prepareQuery("""
			SELECT ?name ?email
			WHERE
			{
				?id foaf:name ?name .
				OPTIONAL { ?id schema:email ?email } .
				?annotation ao:type "hasAuthor" .
				?annotation oa:hasBody ?body .
				?body rdf:object ?id .

			}""", initNs = { 'aop': AOP, 'oa': OA, 'rdf': RDF, 'dcterms': DCTERMS })

		# Fire the query
		results = self.store.query(query, initBindings={'author': URIRef(author)})

		# Build the json
		theJSON = []
		for tag in results:
			article = {}
			article['expression'] = tag.expression
			article['item'] = tag.item
			theJSON.append(article)

		return json.dumps(theJSON, indent=4)

	def getItem(self, expression):
		# Prepare query
		query = sparql.prepareQuery("""
			SELECT ?item
			WHERE
			{
				?expression fabio:hasRepresentation ?item
			}""", initNs = { 'fabio': FABIO })

		# Fire query
		results = self.store.query(query, initBindings={'expression': URIRef(expression)})
		
		if results:
			for tag in results:
				return tag.item
		else:
			return None

	def getHeader(self, url):
		result = str(url).rsplit('/',1)
		result = result[1].rsplit('.',1)
		return result[0]

	def getTitle(self, expression):
		# Prepare query
		query = sparql.prepareQuery("""
			SELECT ?title
			WHERE
			{
				{
					?annotation ao:type "hasTitle" .
					?annotation oa:hasBody ?body .
					?body rdf:subject ?expression .
					?body rdf:object ?title .
				}
				UNION 
				{   
					?annotation ao:type "hasShortTitle" .
					?annotation oa:hasBody ?body .
					?body rdf:subject ?expression .
					?body rdf:object ?title .               
				}
			}""", 
			initNs = { 'oa': OA, 'ao': AO, 'rdf': RDF })

		# Fire query
		results = self.store.query(query, initBindings={'expression': URIRef(expression)})

		if results:
			return results[0].title
		else:
			item = self.getItem(expression)
			if item:
				h1 = self.getHeader()
				if h1:
					return h1
			return expression

	'''
	Add
	'''
	def isAuthor(self, author):
		# Prepare the query
		queryIsAuthor = sparql.prepareQuery("""
			ASK
			WHERE
			{
				?annotation oa:annotatedBy ?author .
			}""",
			initNs = { "oa": OA })

		# Execute the query
		return self.store.query(queryIsAuthor, initBindings={'author': author})

	def addAnnotations(self, jsonObject):
		# Get the provenance
		name = jsonObject['provenance']['annotator']['name']
		email = jsonObject['provenance']['annotator']['email']
		time = jsonObject['provenance']['time']

		# Modificare URI annotator
		annotator = URIRef("mailto:" + email)

		annotations = jsonObject['annotations']

		# Iterate all groups of annotations
		for group in annotations:
			# Get the target
			rawSource = group['target']['source']
			source = URIRef(rawSource.replace("ao:", ns['ao'], 1))

			# Distinguish between document and fragment annotation
			if (len(group['target']) > 1):
				# Specific Resource
				resource = BNode()
				self.store.add((resource, RDF.type, OA.SpecificResource))
				self.store.add((resource, OA.hasSource, source))

				# Fragment Selector
				targetId = group['target']['id']
				targetStart = group['target']['start']
				targetEnd = group['target']['end']
				selector = BNode()
				self.store.add((selector, RDF.type, OA.FragmentSelector))
				self.store.add((selector, RDF.value, Literal(targetId)))
				self.store.add((selector, OA.start, Literal(targetStart, datatype=XSD.nonNegativeInteger)))
				self.store.add((selector, OA.end, Literal(targetEnd, datatype=XSD.nonNegativeInteger)))

				# Assign the Selector to the Resource
				self.store.add((resource, OA.hasSelector, selector))
				source = resource

			# Iterate all annotation instances
			for instance in group['group']:
				# Create a new Annotation
				annotation = BNode()

				# Get the type of annotation
				annotationType = instance['type']

				# Create the body
				body = BNode()
				self.store.add((body, RDF.type, RDF.Statement))

				# Iterate body elements
				for element in instance['body']:
					if element == "subject":
						text = instance['body']['subject']
						subject = URIRef(text.replace("ao:", ns['ao'], 1))
						self.store.add((body, RDF.subject, subject))
					elif element == "predicate":
						predicate = URIRef(instance['body']['predicate'])
						self.store.add((body, RDF.predicate, predicate))
					elif element == "type":
						label = instance['body']['label']
						self.store.add((body, RDFS.label, Literal(label)))
					elif element == "resource":
						resource = instance['body']['resource']
						self.store.add((body, RDF.object, URIRef(resource)))
					elif element == "literal":
						literal = instance['body']['literal']
						self.store.add((body, RDF.object, Literal(literal)))
					elif element == "object":
						resource = instance['body']['object']
						self.store.add((body, RDF.object, URIRef(resource)))     

				# Add the annotator
				self.store.add((annotator, FOAF.name, Literal(name)))
				self.store.add((annotator, SCHEMA.email, Literal(email)))

				# Add the target
				self.store.add((annotation, OA.hasTarget, source))

				# Add the annotation
				annotationType = instance['type']
				self.store.add((annotation, RDF.type, OA.Annotation))
				self.store.add((annotation, AO.type, Literal(annotationType)))
				self.store.add((annotation, OA.hasBody, body))
				self.store.add((annotation, OA.annotatedBy, annotator))
				self.store.add((annotation, OA.annotatedAt, Literal(time)))
		return

	'''
	Store
	'''
	def storeCreate(self, path):
		'''Create a store file and return fd'''
		# Create the Triple Store
		newFile = file(path, "w+")

		# Bind namespaces
		self.store.bind('ao', AO)
		self.store.bind('aop', AOP)
		self.store.bind('dcterms', DCTERMS)
		self.store.bind('fabio', FABIO)
		self.store.bind('foaf', FOAF)
		self.store.bind('frbr', FRBR)
		self.store.bind('oa', OA)
		self.store.bind('rdf', RDF)
		self.store.bind('rdfs', RDFS)
		self.store.bind('schema', SCHEMA)
		self.store.bind('xsd', XSD)

		self.store.serialize(path, format="turtle")
		self.storeConnect(path=path)
		return

	def storeUpdate(self, dirPath):
		'''Update the Triple Store'''
		for fileName in os.listdir(dirPath):
			fileExtension = os.path.splitext(fileName)[1]
			if fileExtension == '.html':
				self.storeAddDocument(fileName)
		return

	def storeAddDocument(self, fileName):
		# Get the name without the extension
		prefix = fileName.split('.html')[0]
		
		if not '_ver' in prefix:
			prefix += '_ver1';

		# Create a new FRBR Work
		work = rdflib.URIRef(AO + prefix.split('_ver')[0])

		# Create a new FRBR Expression
		expression = rdflib.URIRef(AO + prefix)

		# Create a new FRBR Item
		item = rdflib.URIRef(AO + fileName)

		# Add triples
		self.store.add((work, RDF.type, FABIO.Work))
		self.store.add((work, FABIO.hasPortrayal, item))
		self.store.add((work, FRBR.realization, expression))
		self.store.add((expression, RDF.type, FABIO.Expression))
		self.store.add((expression, FABIO.hasRepresentation, item))
		self.store.add((item, RDF.type, FABIO.Item))
		return

	def storeConnect(self, path=None):
		'''Load the store content'''
		if not path:
			return "Insert 'path'."

		self.path = path
		self.store = rdflib.Graph()
		self.store.parse(self.path, format="turtle")

		return

	def storeClose(self):
		'''Close the store connection'''
		self.store.serialize(self.path, format="turtle")

		return
