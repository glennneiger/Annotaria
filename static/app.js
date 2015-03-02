Ext.Loader.setConfig({
	enabled: true
});

Ext.Ajax.cors = true;
Ext.Ajax.useDefaultXhrHeader = false;

Ext.require([
	'Ext.grid.*',
	'Ext.data.*',,
	'Ext.selection.CheckboxModel',
	'Ext.util.*',
	'Ext.state.*',
	'Ext.form.*',
	'Ext.layout.container.Column',
	'Ext.window.MessageBox'
]);

Ext.onReady(function() {
	Ext.create('Ext.data.Store', {
		storeId: 'documentsStore',
		fields: ['name', 'uri']
	});

	Ext.create('Ext.data.ArrayStore', {
		storeId: 'openedDocuments',
		fields: ['title', 'id']
	});

	Ext.create('Ext.data.ArrayStore', {
		storeId: 'selectedTypes',
		fields: ['type'],
		data: [
			["denotesDisease"], 
			["denotesPlace"],
			["denotesPerson"],
			["hasFormattingScore"],
			["hasClarityScore"],
			["hasOriginalityScore"],
			["hasSubject"],
			["hasComment"], 
			["cites"],
			["relatesTo"]
		]
	});

	Ext.create('Ext.data.Store', {
		storeId: 'annotatorStore',
		fields: ['uri', 'name', 'email'],
		sorters: [{
			property: 'name',
			direction: 'ASC'
		}],
	});

	Ext.create('Ext.data.Store', {
		storeId: 'unsavedAnnotations',
		fields: ['count', 'document', 'type', 'label', 'object', 'value', 'id', 
		'start', 'end', 'time', 'annotatorUri', 'annotatorName', 'annotatorEmail', 'spanStart', 'spanEnd'],
	});

	Ext.create('Ext.data.Store', {
		storeId: 'globalAnnotations',
		fields: ['type', 'name', 'email', 'date', 'value']
	});

	Ext.create('Ext.data.Store', {
		storeId: 'localAnnotations',
		fields: ['type', 'label', 'time', 'object', 'value', 'value', 'annotatorUri', 'annotatorName', 
		'annotatorEmail', 'id', 'start', 'end', 'spanStart', 'spanEnd']
	});

	Ext.create('Ext.data.ArrayStore', {
		storeId: 'scoreStore',
		fields: ['score'],
		data: [['very poor'], ['poor'], ['fair'], ['good'], ['excellent']]
	});

	var currentTime = new Date();
	var years = [];
	for (var y = 1970; y <= currentTime.getFullYear() + 1; y++)
		years.push([y]);

	Ext.create('Ext.data.ArrayStore', {
		storeId: 'yearStore',
		fields: ['year'],
		sorters: [{ property : 'year', direction: 'DESC' }],
		data: years
	});

	Ext.create('Ext.data.Store', {
		storeId: 'elementStore',
		fields: ['name', 'uri']
	});

	Ext.create('Ext.data.Store', {
		storeId: 'dbpediaStore',
		fields: ['uri', 'label']
	});

	Ext.create('Ext.data.Store', {
		storeId: 'peopleStore',
		fields: ['uri', 'name', 'email']
	});

	var readerMode = true;
	var currentDocument = null;
	var documentCount = 0;
	var localAnnotations = null;
	var unsavedCounter = 0;
	var isGlobalAnnotation;
	var typeFilterActive = true;
	var authorFilterActive = false;
	var dateFilterActive = false;
	var annotationsConstants = {
		'hasPublisher' : 		['Publisher',			'dcterms:publisher'],
		'hasAuthor' : 			['Author',				'dcterms:creator'],
		'hasComment' : 			['Comment',				'schema:comment'],
		'hasShortTitle' : 		['Short Title',			'fabio:hasShortTitle'],
		'hasTitle' : 			['Title',				'dcterms:title'],
		'hasPublicationYear' : 	['Publication Year',	'fabio:hasPublicationYear'],
		'hasAbstract' : 		['Abstract',			'dcterms:abstract'],

		'denotesPerson' : 		['Person',				'sem:denotes'],
		'relatesTo' : 			['DBpedia Resource',	'skos:related'],
		'cites' : 				['Citation',			'cito:cites'],
		'denotesDisease' : 		['Disease',				'sem:denotes'],
		'hasClarityScore' : 	['Clarity', 			'ao:hasClarityScore'],
		'denotesPlace' : 		['Place',				'sem:denotes '],
		'hasFormattingScore' : 	['Presentation',		'ao:hasFormattingScore'],
		'hasOriginalityScore' : ['Originality',			'ao:hasOriginalityScore'],
		'hasSubject' :          ['Subject Term',		'fabio:hasSubjectTerm']
	};
	var annotator = { 'uri' : '', 'name' : '', 'email' : '' };
	var userSelection = document.createRange();
	userSelection.collapse(false);
	var spanCount = 0;


	/* AJAX load mask */
	var ajaxLoadMask = new Ext.LoadMask(Ext.getBody(), {
		msg:"Please wait..."
	});

	Ext.Ajax.on('beforerequest', ajaxLoadMask.show, ajaxLoadMask);
	Ext.Ajax.on('requestcomplete', ajaxLoadMask.hide, ajaxLoadMask);
	Ext.Ajax.on('requestexception', ajaxLoadMask.hide, ajaxLoadMask);

	/* Request the document list */
	Ext.Ajax.request({
		url: 'wsgi/getDocuments',
		method: 'GET',
		success: function(result, request) {
			var documentsList = Ext.decode(result.responseText).root;
			Ext.getStore('documentsStore').add(documentsList);
		},
		failure: showServerFailureMessage
	});

	/* Request the annotators list */
	Ext.Ajax.request({
		url: 'wsgi/getAnnotators',
		method: 'GET',
		success: function(result, request) {
			var annotators = Ext.decode(result.responseText).root;
			Ext.getStore('annotatorStore').add(annotators);
		},
		failure: showServerFailureMessage
	});

	function showServerFailureMessage() {
		Ext.Msg.alert('Failure', 'AJAX request failed. The server seems unreachable.');
	}

	function createURI(name, storeName) {
		var base = name.replace(/\s+/g, '');
		var count = 1;
		var uri = base;
		var store = Ext.getStore(storeName);

		while (store.find('uri', uri) != -1)
		{
			uri = base + count;
			count++;
		}

		return uri;
	}

	var selModel = Ext.create('Ext.selection.RowModel', {
		listeners: {
			selectionchange: function(sm, selections) {
				panelUnsavedAnnotations.down('#modifyAnnotation').setDisabled(selections.length === 0);
				panelUnsavedAnnotations.down('#removeAnnotation').setDisabled(selections.length === 0);
			}
		}
	});

	var annotatorCombo = Ext.create('Ext.form.field.ComboBox', {
		name: 'annotatorList',
		width: 160,
		displayField: 'name',
		disabled: true,
		store: Ext.getStore('annotatorStore'),
		queryMode: 'local',
		typeAhead: true,
		emptyText: 'Type to filter the list'
	});

	var datePicker = Ext.create('Ext.menu.DatePicker', {
		handler: function (dp, date) {
			var toString = 
				formatNumber(date.getFullYear()) + '-' + 
				formatNumber(date.getMonth() + 1) + '-' +
				formatNumber(date.getDate());
			Ext.getCmp('textfieldDate').setValue(toString);
			dateFilterActive = true;
			applyFilters();
		}
	});

	var panelAvailableDocuments = Ext.create('Ext.grid.Panel', {
		title: 'Documents',
		rootVisiblef: true,
		autoHeight: true,
		floatable: false,
		autoScroll: true,
		rootVisible: true,
		collapsible: true,
		collapsed: false,
		animate: false,
		animCollapse: false,
		collapseDirection: Ext.Component.DIRECTION_BOTTOM,
		titleCollapse: false,
		store: Ext.getStore('documentsStore'),
		columns: [{
			text: 'Title',
			dataIndex: 'name',
			flex: 1
		}],
		listeners: {
			itemclick: {
				fn: function(view, record, item, index, event) {
					//if (currentDocument) return;

					var title = record.data.name;

					// Get the URI of the selected article
					var baseuri = 'http://annotaria.web.cs.unibo.it/documents/';
					var uri = Ext.getStore('documentsStore').findRecord('name', title).get('uri');
					uri = uri.substr(uri.lastIndexOf('/') + 1);
					uri = baseuri.concat(uri);

					currentDocument = title;
					if (!readerMode)
					{
						panelGlobalAnnotations.setDisabled(false);
						panelLocalAnnotations.setDisabled(false);	
					}				

					var child = panelActiveDocuments.child('component[title=' + title + ']');
					if (Ext.isEmpty(child)) {
						var id = 'openedDocument' + documentCount;
						Ext.getStore('openedDocuments').add({ 'title': title, 'id': id });
						documentCount++;

						var newTab = Ext.create('Ext.panel.Panel', {
							id: id,
							title: title,
							closable: true,
							layout: 'fit',
							autoScroll: true,
							scope: this,
							loader: {
								url: uri,
								renderer: 'html',
								autoLoad: false,
								scripts: false,
								ajaxOptions: {
									useDefaultXhrHeader: false,
									failure: function(response) {
										Ext.log(response);
									}
								}
							},
							listeners: {
								beforeclose: function(element) {
									var openedDocuments = Ext.getStore('openedDocuments');
									openedDocuments.removeAt(openedDocuments.find('title', element.title));
									if (element.title == currentDocument)
									{
										currentDocument = null;
										panelGlobalAnnotations.setDisabled(true);
										panelLocalAnnotations.setDisabled(true);									
									}
								},
								removed: function() {
									if (Ext.isEmpty(panelActiveDocuments.query('panel'))) {
										panelAnnotationFilters.setDisabled(true);
									};
								}
							}
						});
						panelActiveDocuments.add(newTab).show();
						panelActiveDocuments.setActiveTab(newTab);
						return true;
					}
					else {
						panelActiveDocuments.setActiveTab(child);
						return false;
					}
				}
			}	
		}
	});

	var panelSavedAnnotations = Ext.create('Ext.grid.Panel', {
		title: 'Document Properties',
		rootVisible: true,
		store: Ext.getStore('globalAnnotations'),
		columns: [
			{
				text: 'Type',
				dataIndex: 'type'
			},
			{
				text: 'Name',
				dataIndex: 'name',
				flex: 1
			},
			{
				text: 'Email',
				dataIndex: 'email',
				flex: 1
			},
			{
				text: 'Date',
				dataIndex: 'date',
				flex: 1
			},
			{
				text: 'Value',
				dataIndex: 'value',
				flex: 3
			}    	
		],
		rootVisible: true,
		collapsible: true,
		collapsed: false,
		animate: false,
		animCollapse: false,
		collapseDirection: Ext.Component.DIRECTION_BOTTOM,
		titleCollapse: false,
		autoScroll: true
	});

	var panelActiveDocuments = Ext.create('Ext.tab.Panel', {
		listeners: {
			tabchange: function(panel, newTab, oldTab) {
				currentDocument = newTab.title;

				panelGlobalAnnotations.setDisabled(readerMode);
				panelLocalAnnotations.setDisabled(readerMode);
				panelAnnotationFilters.setDisabled(false);

				// Reload the current document and its annotations
				var id = Ext.getStore('openedDocuments').findRecord('title', currentDocument).get('id');
				var uri = Ext.getStore('documentsStore').findRecord('name', currentDocument).get('uri');
				Ext.getCmp(id).reload(uri, id);
			}
		}
	});

	var panelUnsavedAnnotations = Ext.create('Ext.grid.Panel', {
		rootVisible: true,
		title: 'Unsaved Annotations',
		store: Ext.getStore('unsavedAnnotations'),
		columns: [ {
				text: 'Document',
				dataIndex: 'document',
				flex: 1
			}, {
				text: 'Type',
				dataIndex: 'type',
				flex: 2
			}, {
				text: 'Value',
				dataIndex: 'value',
				flex: 2
			}],

		collapsible: true,
		collapsed: true,
		animate: false,
		animCollapse: false,
		disabled: true,
		collapseDirection: Ext.Component.DIRECTION_BOTTOM,
		titleCollapse: false,
		floatable: false,
		columnLines: true,
		selModel: selModel,
		dockedItems: [{
			xtype: 'toolbar',
			dock: 'bottom',
			ui: 'footer',
			layout: {
				pack: 'center'
			},
			items: [{
				minWidth: 80,
				id: 'modifyAnnotation',
				text: 'Modify',
				disabled: true,
				handler: modifySelectedAnnotation
			}, {
				minWidth: 80,
				id: 'removeAnnotation',
				text: 'Remove',
				disabled: true,
				handler: removeSelectedAnnotation
			}, {
				id: 'saveAnnotations',
				minWidth: 80,
				text: 'Save All',
				disabled: true,
				handler: saveAllAnnotations
			}]
		}]
	});

	var panelAnnotationFilters = Ext.create('Ext.form.Panel', {
		disabled: true,
		autoHeight: true,
		rootVisible: true,
		floatable: false,
		autoScroll: true,
		rootVisible: true,
		collapsible: true,
		collapsed: false,
		animate: false,
		animCollapse: false,
		collapseDirection: Ext.Component.DIRECTION_BOTTOM,
		titleCollapse: false,
		autoScroll: true,
	    bodyPadding: 10,
	    title: 'Filter Annotations',
		layout: {
			type : 'table',
			columns: 2
		},
		defaults: {
			margin: 5,
			checked: true
		},
	    items: [ 
			{
				xtype      : 'checkboxfield',
				boxLabel   : 'By type:',
				listeners: {
					change: function(checkbox, newValue, oldValue, eOpts) {
						Ext.getCmp('checkboxPerson').setValue(newValue);
						Ext.getCmp('checkboxPlace').setValue(newValue);
						Ext.getCmp('checkboxDisease').setValue(newValue);
						Ext.getCmp('checkboxSubject').setValue(newValue);
						Ext.getCmp('checkboxRelates').setValue(newValue);
						Ext.getCmp('checkboxClarity').setValue(newValue);
						Ext.getCmp('checkboxOriginality').setValue(newValue);
						Ext.getCmp('checkboxFormatting').setValue(newValue);
						Ext.getCmp('checkboxCitation').setValue(newValue);
						Ext.getCmp('checkboxComment').setValue(newValue);
						typeFilterActive = newValue;
					}
				}
			},
		    {
		        xtype      : 'fieldcontainer',
		        defaultType: 'checkboxfield',
		        defaults: {
					checked: true
				},
		        items: [
		            {
		            	id            : 'checkboxPerson',
		            	width         : 160,
		                boxLabel      : 'Person',
		                style: {
							color     : 'white',
							background: 'Green' 
						},
						listeners: {
							change: function(checkbox, newValue, oldValue, eOpts) {
								applyTypeFilter('denotesPerson', newValue);
							}
						}
		            }, {
		            	id            : 'checkboxPlace',
		            	width         : 160,
		                boxLabel	  : 'Place',
		                style: {
								color     : 'white',
								background: 'Teal'
						},
						listeners: {
							change: function(checkbox, newValue, oldValue, eOpts) {
								applyTypeFilter('denotesPlace', newValue);
							}
						}
		            }, {
		            	id            : 'checkboxDisease',
		            	width         : 160,
		                boxLabel      : 'Disease',
		                style: {
								color     : 'white',
								background: 'Olive'
						},
						listeners: {
							change: function(checkbox, newValue, oldValue, eOpts) {
								applyTypeFilter('denotesDisease', newValue);
							}
						}
		            }, {
		            	id            : 'checkboxSubject',
		            	width         : 160,
		                boxLabel      : 'Subject',
		                style: {
								color     : 'white',
								background: 'SaddleBrown'
						},
						listeners: {
							change: function(checkbox, newValue, oldValue, eOpts) {
								applyTypeFilter('hasSubject', newValue);
							}
						}
		            }, {
		            	id            : 'checkboxRelates',
		            	width         : 160,
		                boxLabel      : 'Relates to (DBpedia)',
		                style: {
								color     : 'white',
								background: 'Orange'
						},
						listeners: {
							change: function(checkbox, newValue, oldValue, eOpts) {
								applyTypeFilter('relatesTo', newValue);
							}
						}      
		            }, {
		            	id            : 'checkboxClarity',
		            	width         : 160,
		                boxLabel      : 'Clarity',
		                style: {
								color     : 'white',
								background: 'Red'
						},
						listeners: {
							change: function(checkbox, newValue, oldValue, eOpts) {
								applyTypeFilter('hasClarityScore', newValue);
							}
						}
		            }, {
		            	id            : 'checkboxOriginality',
		            	width         : 160,
		                boxLabel      : 'Originality',
		                style: {
								color     : 'white',
								background: 'Purple'
						},
						listeners: {
							change: function(checkbox, newValue, oldValue, eOpts) {
								applyTypeFilter('hasOriginalityScore', newValue);
							}
						}
		            }, {
		            	id            : 'checkboxFormatting',
		            	width         : 160,
		                boxLabel      : 'Formatting',
		                style: {
								color     : 'white',
								background: 'Indigo'
						},
						listeners: {
							change: function(checkbox, newValue, oldValue, eOpts) {
								applyTypeFilter('hasFormattingScore', newValue);
							}
						}
		            }, {
		            	id            : 'checkboxCitation',
		            	width         : 160,
		                boxLabel      : 'Citation',
		                style: {
								color     : 'white',
								background: 'Blue'
						},
						listeners: {
							change: function(checkbox, newValue, oldValue, eOpts) {
								applyTypeFilter('cites', newValue);
							}
						}
		            }, {
		            	id            : 'checkboxComment',
		            	width         : 160,
		                boxLabel      : 'Comment',
		                style: {
								color     : 'white',
								background: 'DeepSkyBlue'
						},
						listeners: {
							change: function(checkbox, newValue, oldValue, eOpts) {
								applyTypeFilter('hasComment', newValue);
							}
						}
		            }
		        ]
		    },
			{
				xtype      : 'checkboxfield',
				boxLabel   : 'By author:',
				checked    : false,
				listeners: {
					change: function(checkbox, newValue, oldValue, eOpts) {
						annotatorCombo.setValue(null);
						annotatorCombo.setDisabled(newValue - 1);
						Ext.getCmp('buttonAnnotator').setDisabled(newValue - 1);
						if (!newValue)
						{
							authorFilterActive = newValue;
							applyFilters();
						}
					}
				}
			},
			{
	        	xtype      : 'fieldcontainer',
	        	items: [
	        		annotatorCombo,
		        	{
		    			id      : 'buttonAnnotator',
		        		xtype   : 'button',
		        		width   : 160,
		        		text    : 'Show only this annotator',
		        		disabled: true,
						handler: function() {
							var name = annotatorCombo.getValue();
							var record = Ext.getStore('annotatorStore').findRecord('name', name);

							if (record == null)
								Ext.Msg.alert("Error", "You need to select an existing annotator.");
							else
							{
								authorFilterActive = true;
								applyFilters();
							}
						}
		        	}
	        	]
	        },
			{
				xtype      : 'checkboxfield',
				boxLabel   : 'By date:',
				checked    : false,
				listeners: {
					change: function(checkbox, newValue, oldValue, eOpts) {
						Ext.getCmp('textfieldDate').setDisabled(newValue - 1);
						Ext.getCmp('buttonDate').setDisabled(newValue - 1);
						Ext.getCmp('textfieldDate').setValue('');
						if (!newValue)
						{
							dateFilterActive = newValue;
							applyFilters();						
						}
					}
				}
			},	        
	        {
	        	xtype: 'fieldcontainer',
	        	items: [
	        		{
		        		xtype    : 'textfield',
		        		id       : 'textfieldDate',
		        		width    : 160,
		        		readOnly : true,
		        		disabled : true,
		        		emptyText: "No date selected"
		        	},
		        	{
		        		id       : 'buttonDate',
						xtype    : 'button',
						width    : 160,
						disabled : true,
						text     : 'Select a date',
						handler  : function () {
							datePicker.show();
						}
					}
				]
	        }
		]
	});
	
	var panelGlobalAnnotations = Ext.create('Ext.panel.Panel', {
		title: 'Global annotations',
		defaults:
		{
			width: 150,
			margin: 2
		},
		layout: {
			type : 'table',
			columns: 1
		},
		disabled: true,
		defaultType: 'button',
		items: [
			{
				text: 'Author',
				listeners: {
					click: function() {
						isGlobalAnnotation = true;
						showElementAnnotation('hasAuthor', 'person', 'Author', 'wsgi/getPeople', 'wsgi/addPerson', null);
					}
				}
			}, {
				text: 'Publisher',
				listeners: {
					click:  function() {
						isGlobalAnnotation = true;
						showElementAnnotation('hasPublisher', 'publisher', 'Publisher', 'wsgi/getPublishers', 'wsgi/addPublisher', null);
					}
				}
			}, {
				text: 'Publication year',
				listeners: {
					click:  function() {
						isGlobalAnnotation = true;
						showPublicationYearAnnotation(null);
					}
				}
			}, {
				text: 'Short title',
				listeners: {
					click:  function() {
						isGlobalAnnotation = true;
						showShortTitleAnnotation(null);
					}
				}
			}, {
				text: 'Title',
				listeners: {
					click:  function() {
						isGlobalAnnotation = true;
						showLongTextAnnotation('Title', 'Type the title', 'hasTitle', null);
					}
				}
			}, {
				text: 'Abstract',
				listeners: {
					click:  function() {
						isGlobalAnnotation = true;
						showLongTextAnnotation('Abstract', 'Type the abstract', 'hasAbstract', null);
					}
				}
			}, {
				text: 'Comment',
				listeners: {
					click:  function() {
						isGlobalAnnotation = true;
						showLongTextAnnotation('Comment', 'Type the comment', 'hasComment', null);
					}
				}
			}
		]
	});

	var panelLocalAnnotations = Ext.create('Ext.panel.Panel', {
		title: 'Local annotations',
		defaults:
		{
			width: 150,
			margin: 2
		},
		layout: {
			type : 'table',
			columns: 1
		},
		disabled: true,
		defaultType: 'button',
		items: [
			{
				text: 'Person',
				listeners: {
					click: function() {
						if (checkSelection())
							showElementAnnotation('denotesPerson', 'person', 'Person', 'wsgi/getPeople', 'wsgi/addPerson', null);					}
				}
			}, {
				text: 'Place',
				listeners: {
					click:  function() {
						if (checkSelection())
							showElementAnnotation('denotesPlace', 'place', 'Place', 'wsgi/getPlaces', 'wsgi/addPlace', null);
					}
				}
			}, {
				text: 'Disease',
				listeners: {
					click:  function() {
						if (checkSelection())
							showElementAnnotation('denotesDisease', 'disease', 'Disease', 'wsgi/getDiseases', 'wsgi/addSubject', null);
					}
				}
			}, {
				text: 'Subject',
				listeners: {
					click:  function() {
						if (checkSelection())
							showElementAnnotation('hasSubject', 'subject', 'Subject', 'wsgi/getSubjects', 'wsgi/addSubject', null);
					}
				}
			}, {
				text: 'Relates to (DBpedia)',
				listeners: {
					click:  function() {
						if (checkSelection())
							showDbpediaAnnotation(null);
					}
				}
			}, {
				text: 'Clarity score',
				listeners: {
					click:  function() {
						if (checkSelection())
							showScoreAnnotation('Clarity Score', 'hasClarityScore', null);
					}
				}
			}, {
				text: 'Originality score',
				listeners: {
					click:  function() {
						if (checkSelection())
							showScoreAnnotation('Originality Score', 'hasOriginalityScore', null);
					}
				}
			}, {
				text: 'Formatting score',
				listeners: {
					click:  function() {
						if (checkSelection())
							showScoreAnnotation('Formatting Score', 'hasFormattingScore', null);
					}
				}
			}, {
				text: 'Citation',
				listeners: {
					click:  function() {
						if (checkSelection())
							showElementAnnotation('cites', 'document', 'Citation', 'wsgi/getAllDocuments', 'wsgi/addDocument', null, false);
					}
				}
			}, {
				text: 'Comment',
				listeners: {
					click:  function() {
						if (checkSelection())
							showLongTextAnnotation('Comment a part of the document', 'Type the comment', 'hasComment', null);
					}
				}
			}
		]
	});

	var toolbar = Ext.create('Ext.toolbar.Toolbar', {
		items: [{
				xtype: 'box',
				autoEl: {tag: 'img', src:'static/logo.png'},
				height: 60,
				width: 75
			}, {
				xtype: 'label',
				text: 'AnnOtaria',
				id: 'nameApplication'
			},
			'->', {
				xtype: 'button',
				text: 'Mode',
				menu: {
					xtype: 'menu',
					items: [ {
							xtype: 'menucheckitem',
							text: 'Reader',
							id: 'readerSelectorID',
							group: 'univocal-radius-group-name',
							checkChangeDisabled: true,
							listeners: {
								click: function(item, e, eOpts) {
									if (readerMode)
										return;
									else
									{
										readerMode = true;
										panelGlobalAnnotations.setDisabled(true);
										panelLocalAnnotations.setDisabled(true);
										panelUnsavedAnnotations.setDisabled(true);
										item.doAutoRender();
									}
								}
							}
						}, {
							xtype: 'menucheckitem',
							text: 'Annotator',
							id: 'annotatorSelectorID',
							group: 'univocal-radius-group-name',
							checkChangeDisabled: true,
							listeners: {
								click: function(item, e, eOpts) {
									if (!readerMode)
										return;
									else
									{
										showAnnotatorWidget();
									}
								}
							}
						}
					]
				},
				listeners: {
					click: function() {
						Ext.getCmp("readerSelectorID").setChecked(readerMode);
						Ext.getCmp("annotatorSelectorID").setChecked(!readerMode);
					}
				}
			}, {
				text: 'Help',
				handler: function() {
					var help = new Ext.form.Panel({
						width: 500,
						height: 400,
						title: 'Help',
						floating: true,
						closable : true,
						draggable: true,
						autoScroll: true,
						loader:{
							url: 'static/help.html',
							autoLoad: true
						}
					});
					help.show();
					help.center();
      			}
			}, {
				text: 'About',
				handler: function() {
					Ext.Msg.alert('About', 
						"<strong>AnnOtaria - A Semantic-Web Online Editor for BioMedical Documents</strong><br>" +
						"<em>Copyright 2014</em><br><hr>" +
						"Developed by:<br>" +
						"Tommaso Ognibene (tommaso.ognibene@gmail.com)<br>" +
						"Riccardo Dal Fiume (dalfiume.r@gmail.com)");
				}
			}
		],
		docked: 'right'
	});

	Ext.create('Ext.container.Viewport', {
		layout: 'border',
		items: [{
			region: 'north',
			id: 'Menu',
			items : [toolbar],
			border: false,
			collapsible: false
		}, {
			region: 'west',
			title: 'READER',
			items : [panelAvailableDocuments, panelAnnotationFilters],
			collapsible: true,
			collapsed: false,
			overflowY: 'auto',
			width: 350
		}, {
			region: 'east',
			id: 'annotatorRegion',
			items : [panelGlobalAnnotations, panelLocalAnnotations],
			title: 'ANNOTATOR',
			collapsible: true,
			collapsed: false,
			overflowY: 'auto',
			width: 160
		}, {
			layout: 'fit',
			align: 'stretch',
			region: 'center',
			items : [panelActiveDocuments]
		}, {
			region: 'south',
			id: 'southRegion',
			title: 'ANNOTATIONS',
			items : [panelUnsavedAnnotations, panelSavedAnnotations],
			collapsible: true,
			collapsed: true,
			titleCollapse: false,
			activeOnTop: true,
			layout: 'fit',
			height: 300
		}]
	});

	function getGlobalAnnotations(uri) {
		// Clear the store
		var globalAnnotations = Ext.getStore('globalAnnotations');
		globalAnnotations.loadData([], false);

		Ext.Ajax.request({
			url: 'wsgi/getGlobalAnnotations',
			params: {
				uri: uri
			},
			method: 'GET',
			success: function(result, request) {
				var annotations = Ext.decode(result.responseText).annotations;
				globalAnnotations.add(annotations);
			},
			failure: showServerFailureMessage
		});
	}

	function getLocalAnnotations(uri, id) {
		localAnnotations = null;
		Ext.Ajax.request({
			url: 'wsgi/getLocalAnnotations',
			params: {
				uri: uri
			},			
			method: 'GET',
			success: function(result, request) {
				localAnnotations = Ext.decode(result.responseText).annotations;
				for (var i = 0; i < localAnnotations.length; i++)
					parseSavedAnnotation(localAnnotations[i], id);
				applyFilters();
			},
			failure: showServerFailureMessage
		});
	}

	Ext.override(Ext.panel.Panel, {
		reload: function(uri, id){
			var count = 0;
			me = this;
			me.loader.load({
				scope: this,
				renderer: 'html',
				url: me.loader.url,
				params: me.loader.extraParams,
				success: function() {
					count++;
					if (count == 2) {
						getGlobalAnnotations(uri);
						getLocalAnnotations(uri, id);
						displayUnsavedAnnotations(id);
					}
				}
			});
		}
	});

	function formatNumber(number) {
		if (number < 10)
			number = '0' + number;
		return number;
	}

	function formatTime(date) {
		var toString = 
			formatNumber(date.getFullYear()) + '-' + 
			formatNumber(date.getMonth() + 1) + '-' +
			formatNumber(date.getDate()) + 'T' +
			formatNumber(date.getHours()) + ':' +
			formatNumber(date.getMinutes());

		return toString;
	}

	function saveAllAnnotations() {
		var unsavedAnnotations = Ext.getStore('unsavedAnnotations');
		var records = unsavedAnnotations.getRange();
		var time = formatTime(new Date());

		Ext.each(records, function(record)
		{
			var selectedDocument = Ext.getStore('documentsStore').findRecord('name', record.get('document'));
			var type = record.get('type');
			var expression = "http://vitali.web.cs.unibo.it/AnnOtaria/" + selectedDocument.get('name');
			var item = selectedDocument.get('uri');
			var object = record.get('object');

			if (record.get('id') == null)
			{
				// Global annotation
				Ext.Ajax.request({
					url: 'wsgi/addGlobalAnnotation',
					jsonData: { 
						'annotationLabel': annotationsConstants[type][0],
						'annotationType' : type,
						'annotationTime': time,
						'annotator' : record.get('annotatorUri'),
						'bodyObject' : object,
						'bodyPredicate' : annotationsConstants[type][1],
						'bodySubject' : expression,
						'bodyLabel' : record.get('value'),
						'annotationTarget' : item
						},
					method: 'POST',
					failure: showServerFailureMessage
				});				
			}
			else
			{
				// Local annotation
				Ext.Ajax.request({
					url: 'wsgi/addLocalAnnotation',
					jsonData: { 
						'annotationLabel': annotationsConstants[type][0],
						'annotationType' : type,
						'annotationTime': time,
						'annotator' : record.get('annotatorUri'),
						'bodyObject' : object,
						'bodyPredicate' : annotationsConstants[type][1],
						'bodySubject' : expression,
						'bodyLabel' : record.get('value'),
						'annotationTarget' : item,
						'fragmentId': record.get('id'),
						'fragmentStart': record.get('start'),
						'fragmentEnd': record.get('end'),
						},
					method: 'POST',
					failure: showServerFailureMessage
				});
			}
		});

		Ext.Msg.alert("Success", "The annotations have been saved in the public repository as requested.");

		// Clear the store
		unsavedAnnotations.loadData([], false);
		unsavedCounter = 0;

		// Reload the current document and its annotations
		var id = Ext.getStore('openedDocuments').findRecord('title', currentDocument).get('id');
		var uri = Ext.getStore('documentsStore').findRecord('name', currentDocument).get('uri');
		Ext.getCmp(id).reload(uri, id);
	}

	function modifySelectedAnnotation() {
		var selectedAnnotation = selModel.getSelection()[0];
		var type = selectedAnnotation.get('type')
		var value = selectedAnnotation.get('value');

		switch (type)
		{
			// Global annotations
			case 'hasPublicationYear':
				showPublicationYearAnnotation(selectedAnnotation);
				break;
			case 'hasTitle':
				showLongTextAnnotation('Title', 'Type the title', '', selectedAnnotation);
				break;
			case 'hasComment':
				showLongTextAnnotation('Comment', 'Type the comment', '', selectedAnnotation);
				break;
			case 'hasAbstract':
				showLongTextAnnotation('Abstract', 'Type the abstract', '', selectedAnnotation);
				break;
			case 'hasPublisher':
				showElementAnnotation('hasPublisher', 'publisher', 'Publisher', 'wsgi/getPublishers', 'wsgi/addPublisher', selectedAnnotation, true);
				break;
			case 'hasAuthor':
				showElementAnnotation('hasAuthor', 'person', 'Author', 'wsgi/getPeople', 'wsgi/addPerson', selectedAnnotation, true);
				break;
			case 'hasShortTitle':
				showShortTitleAnnotation(selectedAnnotation);
				break;

			// Local annotations
			case 'denotesPerson':
				showElementAnnotation('denotesPerson', 'person', 'Person', 'wsgi/getPeople', 'wsgi/addPerson', selectedAnnotation, false);
				break;
			case 'denotesPlace':
				showElementAnnotation('denotesPlace', 'place', 'Place', 'wsgi/getPlaces', 'wsgi/addPlace', selectedAnnotation, false);
				break;
			case 'denotesDisease':
				showElementAnnotation('denotesDisease', 'disease', 'Disease', 'wsgi/getDiseases', 'wsgi/addSubject', selectedAnnotation, false);
				break;
			case 'hasSubject':
				showElementAnnotation('hasSubject', 'subject', 'Subject', 'wsgi/getSubjects', 'wsgi/addSubject', selectedAnnotation, false);
				break;
			case 'relatesTo':
				showDbpediaAnnotation(selectedAnnotation);
				break;
			case 'hasClarityScore':
				showScoreAnnotation('Clarity Score', 'hasClarityScore', selectedAnnotation);
				break;
			case 'hasOriginalityScore':
				showScoreAnnotation('Originality Score', 'hasOriginalityScore', selectedAnnotation);
				break;
			case 'hasFormattingScore':
				showScoreAnnotation('Formatting Score', 'hasFormattingScore', selectedAnnotation);
				break;
			case 'cites':
				showElementAnnotation('cites', 'document', 'Citation', 'wsgi/getAllDocuments', 'wsgi/addDocument', selectedAnnotation, false);
				break;
		}
	}

	function removeSelectedAnnotation() {
		Ext.Msg.show({
			title: 'Delete Confirmation',
			msg: 'Are you sure you wish to remove the selected annotation?',
			buttons: Ext.Msg.YESNO,
			icon: Ext.Msg.QUESTION,
			fn: function(button, text, opt)
			{
				if (button == 'yes')
				{
					var selectedAnnotation = selModel.getSelection()[0];
					var unsavedAnnotations = Ext.getStore('unsavedAnnotations');
					unsavedAnnotations.remove(selectedAnnotation);
					Ext.getCmp('saveAnnotations').setDisabled((unsavedAnnotations.getCount() == 0));
					redisplayAnnotationStore(selectedAnnotation, true)
				}
			}
		});
	}

	function displayUnsavedAnnotations(id) {
		var unsavedAnnotations = Ext.getStore('unsavedAnnotations');
		var records = unsavedAnnotations.getRange();

		Ext.each(records, function(record)
		{
			// If it is a local annotation regarding the current document ...
			if (record.get('id') && record.get('document') == currentDocument)
			{
				var annotation = {
					'count': record.get('count'),
					'document': record.get('document'), 
					'type': record.get('type'), 
					'label': record.get('label'),
					'value': record.get('value'),
					'object': record.get('object'),
					'id': record.get('id'), 
					'start': record.get('start'), 
					'end': record.get('end'),
					'time': '',
					'annotatorUri': record.get('annotatorUri'),
					'annotatorName': record.get('annotatorName'),
					'annotatorEmail': record.get('annotatorEmail')
				};

				parseUnsavedAnnotation(annotation, id); // ... then display it.

				record.beginEdit();
				record.set('spanStart', annotation['spanStart']);
				record.set('spanEnd', annotation['spanEnd']);
				record.endEdit();
			}
		});
	}

	function addUnsavedAnnotation(currentDocument, type, label, object, value) {
		var annotation = {
			'count':unsavedCounter,
			'document': currentDocument, 
			'type': type, 
			'label': label,
			'value': value,
			'object': object,
			'id': null, 
			'start': null, 
			'end': null,
			'time': '',
			'annotatorUri': annotator['uri'],
			'annotatorName': annotator['name'],
			'annotatorEmail': annotator['email']
		};

		if (!isGlobalAnnotation)
			parseNewAnnotation(annotation);

		Ext.getStore('unsavedAnnotations').add(annotation);
		unsavedCounter++;

		Ext.getCmp('saveAnnotations').setDisabled((Ext.getStore('unsavedAnnotations').getCount() == 0));

		Ext.Msg.alert("Success", "The annotation has been created and stored locally. \n" +  
			"From the panel below you may now change it, remove it, or save it in the public repository.");
	}

	function showShortTitleAnnotation(selectedAnnotation) {
		var buttonLabel = ((selectedAnnotation != null)? 'Modify' : 'Create') + ' Annotation';

		var shortTextPanel = Ext.create('Ext.form.Panel', {
			title: 'Short Title',
			floating: true,
			closable : true,
			bodyStyle: 'padding: 5px 5px 0',
			items: [{
				xtype: 'form',
				anchor: '100%',
				layout: {
					type: 'vbox',
					align: 'stretch'
				},
				border: false,
				bodyPadding: 10,
				items: [{
					xtype: 'textareafield',
					id: 'shortTextArea',
					grow: true,
					name: 'message',
					anchor: '100%',
					width: 200,
					height: 200,
					maxLength: 80,
					emptyText : 'Type the Short Title (max 80 characters).',
					allowBlank: false
				}],
				buttons: [{
					text: buttonLabel,
					formBind: true,
					disabled: true,
					handler: function () {
						var value = Ext.getCmp('shortTextArea').getValue();
						if (selectedAnnotation == null)
							addUnsavedAnnotation(currentDocument, 'hasShortTitle', 'Short Title', value, value);
						else
						{
							selectedAnnotation.beginEdit();
							selectedAnnotation.set('value', value);
							selectedAnnotation.endEdit();
							Ext.Msg.alert("Success", "The annotation has been modified.");
						}
						shortTextPanel.close();
					}
				}]
			}]
		});
		if (selectedAnnotation != null)
			Ext.getCmp('shortTextArea').setValue(selectedAnnotation.get('value'));
		
		shortTextPanel.show();
		shortTextPanel.center();
	}

	function showScoreAnnotation(title, type, selectedAnnotation) {
		var buttonLabel = ((selectedAnnotation != null)? 'Modify' : 'Create') + ' Annotation';

		var scoreCombo = Ext.create('Ext.form.field.ComboBox', {
			displayField: 'score',
			store: Ext.getStore('scoreStore'),
			queryMode: 'local',
			typeAhead: false,
			selectOnFocus: true,
			triggerAction: 'all',
			lazyRender: true,
			allowBlank: false,
			editable: false,
			layout: 'fit',
			forceSelection: true,
			mode: 'local',
			listClass: 'x-combo-list-small',
			emptyText : 'Select a score'
		});

		var scorePanel = Ext.create('Ext.form.Panel', {
			title: title,
			floating: true,
			closable : true,
			bodyStyle: 'padding: 5px 5px 0',
			items: [{
				xtype: 'form',
				anchor: '100%',
				layout: {
					type: 'vbox',
					align: 'stretch'
				},
				border: false,
				bodyPadding: 10,
				items: [scoreCombo],
				buttons: [{
					formBind: true,
					disabled: true,
					text: buttonLabel,
					handler: function () {
						var value = scoreCombo.getValue();
						if (selectedAnnotation == null)
							addUnsavedAnnotation(currentDocument, type, title, value, value);
						else
						{
							selectedAnnotation.beginEdit();
							selectedAnnotation.set('value', value);
							selectedAnnotation.endEdit();
							Ext.Msg.alert("Success", "The annotation has been modified.");
						}
						scorePanel.close();
					}
				}]
			}]
		});
		if (selectedAnnotation != null)
			scoreCombo.select(selectedAnnotation.get('value'));	

		scorePanel.show();
		scorePanel.center();
	}

	function showPublicationYearAnnotation(selectedAnnotation) {
		var buttonLabel = ((selectedAnnotation != null)? 'Modify' : 'Create') + ' Annotation';

		var yearCombo = Ext.create('Ext.form.field.ComboBox', {
			name: 'yearList',
			displayField: 'year',
			store: Ext.getStore('yearStore'),
			queryMode: 'local',
			typeAhead: false,
			selectOnFocus: true,
			triggerAction: 'all',
			lazyRender: true,
			allowBlank: false,
			editable: false,
			layout: 'fit',
			forceSelection: true,
			mode: 'local',
			listClass: 'x-combo-list-small',
			emptyText : 'Select a year'
		});

		var yearPanel = Ext.create('Ext.form.Panel', {
			title: 'Publication Year',
			floating: true,
			closable : true,
			bodyStyle: 'padding: 5px 5px 0',
			items: [{
				xtype: 'form',
				anchor: '100%',
				layout: {
					type: 'vbox',
					align: 'stretch'
				},
				border: false,
				bodyPadding: 10,
				defaultType: 'textfield',
				items: [yearCombo],
				buttons: [{
					formBind: true,
					disabled: true,
					text: buttonLabel,
					handler: function () {
						var value = yearCombo.getValue();
						if (selectedAnnotation == null)
							addUnsavedAnnotation(currentDocument, 'hasPublicationYear', 'Publication Year', value, value);	
						else
						{
							selectedAnnotation.beginEdit();
							selectedAnnotation.set('value', value);
							selectedAnnotation.endEdit();
							Ext.Msg.alert("Success", "The annotation has been modified.");
						}
						yearPanel.close();
					}
				}]
			}]
		});
		if (selectedAnnotation != null)
		{
			yearCombo.select(selectedAnnotation.get('value'));	
		}
		
		yearPanel.show();
		yearPanel.center();
	}

	function showLongTextAnnotation(title, emptyText, type, selectedAnnotation) {
		var buttonLabel = ((selectedAnnotation != null)? 'Modify' : 'Create') + ' Annotation';

		var longTextPanel = Ext.create('Ext.form.Panel', {
			title: title,
			floating: true,
			closable : true,
			bodyStyle: 'padding: 5px 5px 0',
			items: [{
				xtype: 'form',
				anchor: '100%',
				layout: {
					type: 'vbox',
					align: 'stretch'
				},
				border: false,
				bodyPadding: 10,
				items: [{
					xtype: 'textareafield',
					id: 'longTextArea',
					grow: true,
					name: 'message',
					anchor: '100%',
					width: 450,
					height: 200,
					emptyText : emptyText,
					allowBlank: false
				}],
				buttons: [{
					text: buttonLabel,
					formBind: true,
					disabled: true,
					handler: function () {
						var value = Ext.getCmp('longTextArea').getValue();
						if (selectedAnnotation == null)
							addUnsavedAnnotation(currentDocument, type, title, value, value);
						else
						{
							selectedAnnotation.beginEdit();
							selectedAnnotation.set('value', value);
							selectedAnnotation.endEdit();
							Ext.Msg.alert("Success", "The annotation has been modified.");
						}
						longTextPanel.close();
					}
				}]
			}]
		});
		if (selectedAnnotation != null)
			Ext.getCmp('longTextArea').setValue(selectedAnnotation.get('value'));
		
		longTextPanel.show();
		longTextPanel.center();
	}

	function showElementAnnotation(elementType, elementLabel, elementTitle, getURI, postURI, selectedAnnotation) {
		Ext.Ajax.request({
			url: getURI,
			method: 'GET',
			success: function(result, request) {
				var elements = Ext.decode(result.responseText).root;
				Ext.getStore('elementStore').add(elements);
			},
			failure: showServerFailureMessage
		});

		function addElement(name) {
			var uri = "http://vitali.web.cs.unibo.it/AnnOtaria/" + elementLabel + "/" + createURI(name, 'elementStore');

			Ext.Ajax.request({
				url: postURI,
				jsonData: { 
					'uri': "<" + uri + ">",
					'name' : name },
				method: 'POST',
				success: function(result, request) {
					Ext.getStore('elementStore').add({'name' : name, 'uri' : uri});
					Ext.Msg.alert("Success", name + " has been added to the list.");
				},
				failure: showServerFailureMessage
			});
		}

		var elementCombo = Ext.create('Ext.form.field.ComboBox', {
			fieldLabel: 'Select a name',
			labelWidth: 120,
			name: 'elementList',
			displayField: 'name',
			store: Ext.getStore('elementStore'),
			queryMode: 'local',
			typeAhead: true,
			emptyText : 'Type for filter the list'
		});

		var buttonLabel = ((selectedAnnotation != null)? 'Modify' : 'Create') + ' Annotation';

		var elementPanel = Ext.create('Ext.form.Panel', {
			title: elementTitle,
			floating: true,
			closable : true,
			bodyStyle: 'padding: 5px 5px 0',
			items: [{
				xtype: 'fieldset',
				title: 'Existing ' + elementLabel,
				width: 500,
				collapsible: true,
				defaults: {
					anchor: '100%'
				},
				layout: 'anchor',
				items: [{
					xtype: 'form',
					anchor: '100%',
					border: false,
					bodyPadding: 10,
					layout: {
						type: 'vbox',
						align: 'stretch'
					},
					defaultType: 'textfield',
					items: [elementCombo],
					buttons: [
						{
							text: buttonLabel,
							handler: function () {
								var form = this.up('form').getForm();
								var name = form.getValues()['elementList'];
								var store = Ext.getStore('elementStore');
								var record = store.findRecord('name', name);

								if (record == null)
									Ext.Msg.alert("Error", "You need to select an existing " + elementLabel + ".");
								else
								{
									var value = elementCombo.getValue();
									if (selectedAnnotation == null)
										addUnsavedAnnotation(currentDocument, elementType, elementLabel, record.get('uri'), value);	
									else
									{
										selectedAnnotation.beginEdit();
										selectedAnnotation.set('value', value);
										selectedAnnotation.endEdit();
										Ext.Msg.alert("Success", "The annotation has been modified.");
									}
									elementPanel.close();
								}
							}
						}
					]
				}]
			}, {
				xtype: 'fieldset',
				title: 'New ' + elementLabel,
				width: 500,
				collapsible: true,
				collapsed: true,
				layout: 'anchor',
				items: [{
					xtype: 'form',
					anchor: '100%',
					layout: {
						type: 'vbox',
						align: 'stretch'
					},
					border: false,
					bodyPadding: 10,                
					defaultType: 'textfield',
					items: [{
							fieldLabel: 'Write a name',
							labelWidth: 120,
							name: 'name',
							allowBlank: false
						}
					],
					buttons: [			
						{
							text: 'Create ' + elementLabel,
							formBind: true,
							disabled: true,
							handler: function () {
								var form = this.up('form').getForm();
								if (form.isValid()) {
									panelUnsavedAnnotations.setDisabled(false);
									var values = form.getValues();
									addElement(values['name']);
								}
							}
						}
					]
				}]
			}]
		});

		if (selectedAnnotation != null)
			elementCombo.select(selectedAnnotation.get('value'));	

		elementPanel.show();
		elementPanel.center();
	}

	function showDbpediaAnnotation(selectedAnnotation) {
		function queryDbpedia(key) {
		//	var query = "SELECT ?uri ?label WHERE {?uri a <http://dbpedia.org/ontology/" + key + ">; rdfs:label ?label.}";
			var query = "SELECT distinct ?uri ?label \
						WHERE { \
							?uri rdfs:label ?label . \
							FILTER (lang(?label) = 'en'). \
							?label bif:contains \"\'"+key+"\'\" . \
							?uri dcterms:subject ?sub \
						} ORDER BY ASC(?label)\
						LIMIT 1000";
			var encodedQuery = encodeURIComponent(query);
			var encodedGraph = encodeURIComponent("http://dbpedia.org");
			var queryURL = "http://dbpedia.org/sparql" + "?default-graph-uri=" + encodedGraph + "&query=" + encodedQuery + "&format=json";

			
			ajaxLoadMask.show();	/* Load mask */
			Ext.data.JsonP.request({
				url: queryURL,
				callbackKey: 'callback',
				success : function(response) {
					ajaxLoadMask.hide();	/* Remove mask */

					var results = response["results"]["bindings"];
					var length = results.length;

					Ext.Msg.alert("Results", "The query has retrieved " + length + " results.");

					/* Remove all previous entries in the store */
					Ext.getStore('dbpediaStore').removeAll();

					for (var i = 0; i < length; i++) {
						Ext.getStore('dbpediaStore').add({
							'uri' : results[i]['uri']['value'],
							'label' : results[i]['label']['value']
						});
					}
				},
				failure: function() {
					ajaxLoadMask.hide();	/* Remove mask */
					showServerFailureMessage();
				}
			});
		}

		var dbpediaCombo = Ext.create('Ext.form.field.ComboBox', {
			name: 'dbpediaList',
			displayField: 'label',
			store: Ext.getStore('dbpediaStore'),
			queryMode: 'local',
			typeAhead: false,
			selectOnFocus: true,
			triggerAction: 'all',
			lazyRender: true,
			allowBlank: false,
			editable: false,
			layout: 'fit',
			mode: 'local',
			emptyText : 'Search results'			
		});

		var buttonLabel = ((selectedAnnotation != null)? 'Modify' : 'Create') + ' Annotation';

		var dbpediaPanel = Ext.create('Ext.form.Panel', {
			title: 'Resource from DBpedia',
			floating: true,
			closable : true,
			bodyStyle: 'padding: 5px 5px 0',
			items: [{
				xtype: 'fieldset',
				title: 'Search a resource',
				width: 400,
				defaults: {
					anchor: '100%'
				},
				layout: 'anchor',
				items: [{
					xtype: 'form',
					anchor: '100%',
					layout: {
						type: 'vbox',
						align: 'stretch'
					},
					border: false,
					bodyPadding: 10,                
					defaultType: 'textfield',
					items: [{
						name: 'key',
						allowBlank: false
					}],
					buttons: [{
						text: 'Search',
						handler: function () {
							var form = this.up('form').getForm();
							if (form.isValid()) {
								var key = form.getValues()['key'];
								queryDbpedia(key);
							}
						}
					}]
				}]
			},{
				xtype: 'fieldset',
				title: 'Select a resource',
				width: 400,
				defaults: {
					anchor: '100%'
				},
				layout: 'anchor',
				items: [{        	
					xtype: 'form',
					anchor: '100%',
					border: false,
					bodyPadding: 10,
					layout: {
						type: 'vbox',
						align: 'stretch'
					},
					items: [dbpediaCombo],
					buttons: [{
						text: buttonLabel,
						formBind: true,
						disabled: true,
						handler: function () {
							var form = this.up('form').getForm();
							if (form.isValid()) {
								var value = dbpediaCombo.getValue();
								var uri = Ext.getStore('dbpediaStore').getAt(Ext.getStore('dbpediaStore').findExact('label', value)).get('uri');

								if (selectedAnnotation == null)
									addUnsavedAnnotation(currentDocument, 'relatesTo', 'Relates to (DBpedia)', uri, value);
								else
								{
									selectedAnnotation.beginEdit();
									selectedAnnotation.set('value', value);
									selectedAnnotation.endEdit();
									Ext.Msg.alert("Success", "The annotation has been modified.");
								}
								dbpediaPanel.close();
							}
						}
					}]
				}]
			}]
		});

		if (selectedAnnotation != null)
			dbpediaCombo.select(selectedAnnotation.get('value'));	

		dbpediaPanel.show();
		dbpediaPanel.center();
	}

	function applyTypeFilter(element, add) {
		var selectedTypes = Ext.getStore('selectedTypes');
		if (add)
			selectedTypes.add({'type': element});
		else
			selectedTypes.removeAt(selectedTypes.find('type', element));

		applyFilters();
	}

	function showAnnotatorWidget() {
		Ext.Ajax.request({
			url: 'wsgi/getAnnotators',
			method: 'GET',
			success: function(result, request) {
				var people = Ext.decode(result.responseText).root;
				Ext.getStore('peopleStore').add(people);
			},
			failure: showServerFailureMessage
		});

		function addAnnotator(uri, name, email) {
			Ext.Ajax.request({
				url: 'wsgi/addAnnotator',
				jsonData: { 
					'uri': '<' + uri + '>', 
					'name' : name, 
					'email' : email },
				method: 'POST',
				failure: showServerFailureMessage
			});		
		}		

		function checkAnnotator(name, email) {
			var peopleStore = Ext.getStore('peopleStore');
			var uri;

			/* Check if the given email has been already saved in the dataset */
			var record = peopleStore.findRecord('email', email);
			if (record)
			{
				/* Check if the given name is equal to the saved one */
				var recordName = record.get('name');
				if (name.localeCompare(recordName) == 0)
				{
					/* Get the URI already defined in the triplestore */
					uri = record.get('uri');
				}
				else
				{
					Ext.Msg.alert("Error", "The given email is already binded to the name '" + recordName + 
						"'. \nTherefore, either modify the name or the email in order to define a unique identification.");
					return false;
				}
			}
			else
			{
				/* No email found, has to be a new guy. Create a new URI */
				var baseuri = "http://vitali.web.cs.unibo.it/AnnOtaria/person/";
				shortname = name.replace(/\s+/g, '');
				uri = baseuri + shortname;

				var count = 1
				while (peopleStore.findExact('uri', uri) > Number(-1))
				{
					uri = baseuri + shortname + '-' + count;
					count++;
				};
				addAnnotator(uri, name, email);
			}

			annotator['uri'] = uri;
			annotator['name'] = name;
			annotator['email'] = email;

			Ext.Msg.alert("Success", "Welcome " + annotator['name'] + 
				", you may now proceed adding new annotations of your own.");

			panelGlobalAnnotations.setDisabled((currentDocument == ''));
			panelLocalAnnotations.setDisabled((currentDocument == ''));	
			panelUnsavedAnnotations.setDisabled(false);
			win.close();
			return true;
		}

		var annotatorForm = Ext.create('Ext.form.Panel', {
			layout: {
				type: 'vbox',
				align: 'stretch'
			},
			border: false,
			bodyPadding: 10,
			defaultType: 'textfield',
			items: [{
					fieldLabel: 'Name',
					name: 'name',
					allowBlank: false
				}, {
					fieldLabel: 'Email',
					name: 'email',
					vtype: 'email',
					allowBlank: false
				}
			],
			buttons: [
				{
					text: 'Reset',
					handler: function () {
						this.up('form').getForm().reset();
					}
				}, {
					text: 'Cancel',
					handler: function() {
						win.close();
					}
				}, {
					text: 'Submit',
					formBind: true,
					disabled: true,
					handler: function () {
						var form = this.up('form').getForm();
						if (form.isValid())
						{
							var values = form.getValues();
							var res = checkAnnotator(values['name'], values['email']);
							if (res) readerMode = false;
						}
					}
				}
			]
		});

		var win = Ext.widget('window', {
			title: 'Annotator data',
			bodyPadding: 5,
			width: 350,
			layout: 'anchor',
			defaults: {
				anchor: '100%'
			},
			items: annotatorForm
		});

		win.show();
	}

	// Get all text nodes within the node.
	Node.prototype.getChildrenTextNodes = function(children) { 
		for (var i = 0; i < this.childNodes.length; i++)
			(this.childNodes[i].nodeType == 3)? 
				children.push(this.childNodes[i]) : 
				this.childNodes[i].getChildrenTextNodes(children);
	};

	// Get the first node which is not created by Annotaria.
	Node.prototype.getNonAnnotariaAncestor = function () {
		var id, ancestor = this;
		do {
			ancestor.son = ancestor
			ancestor = ancestor.parentNode;
			id = ancestor.id;
		} while (id.indexOf("span-ann") != -1);

		return ancestor;
	};

	// Get the position of the node with respect to a list of nodes.
	NodeList.prototype.indexOf = function(nodes) { 
		var i = 0; 

		while (this.item(i) !== nodes) i++;

		return i ;
	};

	function getUserSelection() {
		if (window.getSelection)
			return window.getSelection();
		if (document.getSelection)
			return document.getSelection();
		if (document.selection)
			return document.selection.createRange().text;
	}

	// Get the container of a range. The container is the first not textual node containig the range.
	function getRangeContainer(range) {
		var container = range.commonAncestorContainer;

		return (container.nodeType == 3)? container.parentNode : container;
	}

	function checkSelection() {
		userSelection = getUserSelection().getRangeAt(0);
		if (isValidSelection(userSelection))
		{
			isGlobalAnnotation = false;
			return true;
		}
		
		Ext.Msg.alert("Error", "You have to select a portion of the document in order to perform a local annotation.");
		return false;
	}

	// Check if the selection is valid, i.e. it is within the document currently displayed in the tab panel.
	function isValidSelection(range) {
		if (range.collapsed) return false;

		var id = Ext.getStore('openedDocuments').findRecord('title', currentDocument).get('id');
		var rangeContainer = getRangeContainer(range);

		return Ext.fly(id).contains(rangeContainer);
	}

	// Get all text nodes within a selection. Even the overlapping ones.
	function getRangeTextNodes(range) {
		var rangeContainer = getRangeContainer(range), children = [], start, end;

		rangeContainer.getChildrenTextNodes(children);

		start = children.indexOf(range.startContainer);
		children.splice(0, start);

		end = children.indexOf(range.endContainer) + 1;
		children.splice(end, children.length - end);

		return children;
	}

	function redisplayAnnotation(annotation, filtered) {
		var numSpans = annotation['spanEnd'] - annotation['spanStart'] + 1;
		for (var i = 0; i < numSpans; i++)
		{
			var id = 'span-ann-' + (i + annotation['spanStart']);
			var span = Ext.fly(id).dom;

			if (filtered)
				span.setAttribute('annotariaStyle', 'hidden');
			else
				span.setAttribute('annotariaStyle', annotation['type']);
		}
	}

	function redisplayAnnotationStore(annotation, filtered) {
		var numSpans = annotation.get('spanEnd') - annotation.get('spanStart') + 1;

		for (var i = 0; i < numSpans; i++)
		{
			var id = 'span-ann-' + (i + annotation.get('spanStart'));
			var span = Ext.fly(id).dom;

			if (filtered)
				span.setAttribute('annotariaStyle', 'hidden');
			else
				span.setAttribute('annotariaStyle', annotation.get('type'));
		}
	}	

	function applyFiltersSingleAnnotation(annotation) {
		// Apply type filter
		if (typeFilterActive)
		{
			var index = Ext.getStore('selectedTypes').find('type', annotation['type']);
			if (index == -1)
			{
				redisplayAnnotation(annotation, true)
				return;
			}
		}

		// Apply author filter
		if (authorFilterActive)
		{			
			var name = annotatorCombo.getValue();
			if (annotation['annotatorName'] != name)
			{
				redisplayAnnotation(annotation, true)
				return;
			}
		}
			
		// Apply date filter	
		if (dateFilterActive)
		{			
			var date = Ext.getCmp('textfieldDate').getValue()
			if (annotation['time'].lastIndexOf(date, 0) != 0)
			{
				redisplayAnnotation(annotation, true)
				return;
			}
		}	

		redisplayAnnotation(annotation, false)		
	}

	function applyFiltersSingleAnnotationStore(annotation) {
		// Apply type filter
		if (typeFilterActive)
		{
			var index = Ext.getStore('selectedTypes').find('type', annotation.get('type'));
			if (index == -1)
			{
				redisplayAnnotationStore(annotation, true)
				return;
			}
		}

		// Apply author filter
		if (authorFilterActive)
		{			
			var name = annotatorCombo.getValue();
			if (annotation.get('annotatorName') != name)
			{
				redisplayAnnotationStore(annotation, true)
				return;
			}
		}
			
		// Apply date filter	
		if (dateFilterActive)
		{			
			var date = Ext.getCmp('textfieldDate').getValue()
			if (annotation.get('time').lastIndexOf(date, 0) != 0)
			{
				redisplayAnnotationStore(annotation, true)
				return;
			}
		}	

		redisplayAnnotationStore(annotation, false)		
	}	

	function applyFilters() {
		// Filter saved local annotations
		for (var i = 0; i < localAnnotations.length; i++)
			applyFiltersSingleAnnotation(localAnnotations[i]);

		// Filter unsaved local annotations
		var records = Ext.getStore('unsavedAnnotations').getRange();

		Ext.each(records, function(record) {
			if (record.get('id') != null)
				applyFiltersSingleAnnotationStore(record);
		});
	}

	// Insert the span element(s) representing an annotation.
	function displayAnnotation(nodes, offStart, offEnd, annotation) {
		for (var i = 0; i < nodes.length; i++)
		{
			var range = document.createRange();

			if (i == 0 && offStart > 0)
				range.setStart(nodes[i], offStart);
			else
				range.setStartBefore(nodes[i]);

			if (i == nodes.length - 1 && offEnd < nodes[i].textContent.length)
				range.setEnd(nodes[i], offEnd);
			else
				range.setEndAfter(nodes[i]);

			var span = document.createElement('span');
			span.setAttribute('id', 'span-ann-' + spanCount);
			span.setAttribute('annotariaStyle', annotation['type']);
			span.onclick = function() {
				var annotationInfo = Ext.create('Ext.panel.Panel', {
					floating: true,
					closable : true,
					draggable:true,
					resizable: true,
					bodyPadding: 10,
					title: 'Annotation Info',
					layout: {
						type : 'table',
						columns: 1
					},
					items: [ 
						{
							fieldLabel: 'Name',
							xtype    : 'textfield',
							width    : 350,
							readOnly : true,
							value: annotation['annotatorName']
						}, {
							fieldLabel: 'Email',
							xtype    : 'textfield',
							width    : 350,
							readOnly : true,
							value: annotation['annotatorEmail']
						}, {
							fieldLabel: 'Date',
							xtype    : 'textfield',
							width    : 350,
							readOnly : true,
							value: annotation['time']
						}, {
							fieldLabel: 'Label',
							xtype    : 'textfield',
							width    : 350,
							readOnly : true,
							value: annotation['label']
						}, {
							fieldLabel: 'Value',
							xtype    : 'textfield',
							width    : 350,
							readOnly : true,
							value: annotation['value']
						}  
					]
				});
				annotationInfo.show();
			};

			spanCount++;
			range.surroundContents(span);
		}
	}

	// Insert the span element(s) representing an annotation.
	function displayAnnotationStore(nodes, offStart, offEnd, annotation) {
		for (var i = 0; i < nodes.length; i++) {
			var range = document.createRange();

			if (i == 0 && offStart > 0)
				range.setStart(nodes[i], offStart);
			else
				range.setStartBefore(nodes[i]);

			if (i == nodes.length - 1 && offEnd < nodes[i].textContent.length)
				range.setEnd(nodes[i], offEnd);
			else
				range.setEndAfter(nodes[i]);

			var span = document.createElement('span');
			span.setAttribute('id', 'span-ann-' + spanCount);
			span.setAttribute('annotariaStyle', annotation['type']);
			span.onclick = function() {
				var updatedAnnotation = Ext.getStore('unsavedAnnotations').findRecord('count', annotation['count']);
				var annotationInfo = Ext.create('Ext.panel.Panel', {
					floating: true,
					closable : true,
					draggable:true,
					resizable: true,
					bodyPadding: 10,
					title: 'Annotation Info',
					layout: {
						type : 'table',
						columns: 1
					},
					items: [ 
						{
							fieldLabel: 'Name',
							xtype    : 'textfield',
							width    : 350,
							readOnly : true,
							value: updatedAnnotation.get('annotatorName')
						}, {
							fieldLabel: 'Email',
							xtype    : 'textfield',
							width    : 350,
							readOnly : true,
							value: updatedAnnotation.get('annotatorEmail')
						}, {
							fieldLabel: 'Date',
							xtype    : 'textfield',
							width    : 350,
							readOnly : true,
							value: updatedAnnotation.get('time')
						}, {
							fieldLabel: 'Label',
							xtype    : 'textfield',
							width    : 350,
							readOnly : true,
							value: updatedAnnotation.get('label')
						}, {
							fieldLabel: 'Value',
							xtype    : 'textfield',
							width    : 350,
							readOnly : true,
							value: updatedAnnotation.get('value')
						}  
					]
				});
				annotationInfo.show();				
			};

			spanCount++;
			range.surroundContents(span);
		}
	}

	// Parse a unsaved annotation created by the user.
	function parseUnsavedAnnotation(annotation, tabId) {
		var textNodes = [], nodes = [], i, length = 0, offStart, offEnd, ancestor;
		var queryString = "#" + tabId + " #" + annotation["id"];
		var parsedAnnotation = Ext.query(queryString);

		if (parsedAnnotation.length == 0) return;

		ancestor = Ext.fly(parsedAnnotation[0]).dom;
		ancestor.getChildrenTextNodes(textNodes);

		for (i = 0; i < textNodes.length && annotation["start"] >= length; i++)
			length += textNodes[i].nodeValue.length;

		nodes.push(textNodes[i - 1]);
		offStart = annotation["start"] - length + textNodes[i - 1].nodeValue.length

		for ( ; i < textNodes.length && length < annotation["end"]; i++) {
			length += textNodes[i].nodeValue.length;
			nodes.push(textNodes[i]);
		}
		offEnd = annotation["end"] - length + textNodes[i - 1].nodeValue.length;

		annotation['spanStart'] = spanCount;
		annotation['spanEnd'] = spanCount + nodes.length - 1;

		displayAnnotationStore(nodes, offStart, offEnd, annotation);
	}

	// Parse a saved annotation created by the user.
	function parseSavedAnnotation(annotation, tabId) {
		var textNodes = [], nodes = [], i, length = 0, offStart, offEnd, ancestor;
		var queryString = "#" + tabId + " #" + annotation["id"];
		var parsedAnnotation = Ext.query(queryString);

		if (parsedAnnotation.length == 0) return;

		ancestor = Ext.fly(parsedAnnotation[0]).dom;
		ancestor.getChildrenTextNodes(textNodes);

		for (i = 0; i < textNodes.length && annotation["start"] >= length; i++)
			length += textNodes[i].nodeValue.length;

		nodes.push(textNodes[i - 1]);
		offStart = annotation["start"] - length + textNodes[i - 1].nodeValue.length

		for ( ; i < textNodes.length && length < annotation["end"]; i++) {
			length += textNodes[i].nodeValue.length;
			nodes.push(textNodes[i]);
		}
		offEnd = annotation["end"] - length + textNodes[i - 1].nodeValue.length;

		annotation['spanStart'] = spanCount;
		annotation['spanEnd'] = spanCount + nodes.length - 1;

		displayAnnotation(nodes, offStart, offEnd, annotation);
	}

	// Parse a new annotation created by the user.
	function parseNewAnnotation(annotation) {
		var textNodes = getRangeTextNodes(userSelection);
		var offStart = userSelection.startOffset;
		var offEnd = userSelection.endOffset;
		var ancestor = getRangeContainer(userSelection);

		if (ancestor.id.indexOf("span-ann") != -1)
			ancestor = ancestor.getNonAnnotariaAncestor();
		
		var children = [];
		ancestor.getChildrenTextNodes(children);
		for (var i = 0; i < children.indexOf(textNodes[0]); i++) {
			offStart += children[i].nodeValue.length;
			offEnd += children[i].nodeValue.length;
		}
		for (var i = children.indexOf(textNodes[0]); i < children.indexOf(textNodes[textNodes.length - 1]); i++)
			offEnd += children[i].nodeValue.length;

		annotation['id'] = ancestor.id;
		annotation['start'] = offStart;
		annotation['end'] = offEnd;
		annotation['spanStart'] = spanCount;
		annotation['spanEnd'] = spanCount + textNodes.length - 1;

		displayAnnotationStore(textNodes, userSelection.startOffset, userSelection.endOffset, annotation);
	}	
});