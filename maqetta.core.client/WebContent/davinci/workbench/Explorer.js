dojo.provide("davinci.workbench.Explorer");

dojo.require("davinci.Workbench");
dojo.require("davinci.workbench.ViewPart");

dojo.require("dijit.Tree");
dojo.require("davinci.ui.widgets.TransformTreeMixin");
dojo.require("davinci.ui.dnd.DragSource");
dojo.require("system.resource");
dojo.require("davinci.ui.widgets.ProjectSelection");

//ui_plugin.js
dojo.require("davinci.ui.Download");
dojo.require("davinci.ui.DownloadSelected");
dojo.require("davinci.ui.UserLibraries");
dojo.require("davinci.ui.widgets.ProjectToolbar");

dojo.declare("davinci.workbench.Explorer", davinci.workbench.ViewPart, {
	
	toolbarID: "workbench.Explorer",
	getActionsID: function () {
	
		//	return "davinci.ve.VisualEditorOutline";

		return "davinci.workbench.Explorer";
	},
	
	postCreate: function(){
		this.inherited(arguments);

		var dragSources=davinci.Runtime.getExtensions("davinci.dnd", function (extension){
			 return dojo.some(extension.parts,function(item){ return item=="davinci.ui.navigator"; }) && extension.dragSource;
		});
		
		var model= system.resource;

		// Patch Tree to allow for image drag-and-drop.  code moved from davinci.ui.widget.Tree.
		// TODO: Would be better and more efficient to make use of the dijit.Tree drag-and-drop with dojo.dnd,
		// but it does not seem to perform well over an IFRAME and would require some reworking of the drag source and target.
		var imageDragTree = dojo.declare("", dijit.Tree, { //FIXME: why won't null work as first arg to dojo.declare?
			_createTreeNode: function(args){
				var treeNode = this.inherited(arguments);
		 		if (dragSources && args.item){
					dragSources.forEach(function(source){
						if (source.dragSource(args.item)){
							var ds = new davinci.ui.dnd.DragSource(treeNode.domNode, "component", treeNode);
							ds.targetShouldShowCaret = true;
							ds.returnCloneOnFailure = false;
							dojo["require"](source.dragHandler);
							var dragHandlerClass = dojo.getObject(source.dragHandler); 
							ds.dragHandler = new dragHandlerClass(args.item);
			                this.connect(ds, "initDrag", function(e){if (ds.dragHandler.initDrag) ds.dragHandler.initDrag(e);}); // move start
							this.connect(ds, "onDragStart", function(e){ds.dragHandler.dragStart(e);}); // move start
							this.connect(ds, "onDragEnd", function(e){ds.dragHandler.dragEnd(e);}); // move end
						}
			 		}, this);
		 		}
				return treeNode;
			}
		});
		var tree = this.tree = new imageDragTree({
			showRoot:false,
			model: model, id:'resourceTree',
			labelAttr: "name", childrenAttrs:"children",
			getIconClass: this._getIconClass,
			getRowClass: this._getRowClass,
			transforms: [system.resource.alphabeticalSort],
			isMultiSelect: true});

		// Because there are two child elements in this layout container, and it only sizes the top (topDiv), we have to manage the size of the children
		// ourselves (or use yet another layout container to do it)  We'll just use CSS to fix the bottom of the Tree to the bottom of the panel,
		// using a variation of the 4-corners CSS trick.  An additional kludge seems necessary to set the Tree width properly to account for the scrollbar.
		dojo.style(tree.domNode, {width: "100%", "overflow-x": "hidden", position: "absolute", bottom: 0, top: "20px"});

		// The default tree dndController does a stopEvent in its mousedown handler, preventing us from doing our own DnD.
		// Circumvent dojo.stopEvent temporarily.
		var down = tree.dndController.onMouseDown,
			handler = function(oldHandler, event){
				var stop = dojo.stopEvent;
				dojo.stopEvent = function(){};
				try{
					oldHandler.call(tree.dndController, event);
				}finally{
					dojo.stopEvent = stop;	
				}
			};
		tree.dndController.onMouseDown = dojo.hitch(null, handler, down);
		
		var topDiv = dojo.doc.createElement('div');

		if(davinci.Runtime.singleProjectMode()){
			var projectSelection = new davinci.ui.widgets.ProjectToolbar({});
			topDiv.appendChild(projectSelection.domNode);
			
			
			dojo.connect(projectSelection, "onChange", function(){
				var project = this.value;
				davinci.Runtime.loadProject(project);
			});
			
			
		}
		topDiv.appendChild(tree.domNode);
		this.setContent(topDiv);
		
		tree.startup();

		dojo.connect(tree, 'onDblClick', dojo.hitch(this,this._dblClick ));
		tree.watch("selectedItems", dojo.hitch(this, function (prop, oldValue, newValue) {
			var items = dojo.map(newValue, function(item){ return {resource:item}; });
			this.publish("/davinci/ui/selectionChanged", [items, this]);
		}));

		var popup=davinci.Workbench.createPopup({
			partID: 'davinci.ui.navigator',
			domNode: this.tree.domNode,
			openCallback:function (event)
			{
				// Make sure corresponding node on the Tree is set, as needed for right-mouse clicks (ctrl-click selects just fine)
				var w = dijit.getEnclosingWidget(event.target);
				if(w && w.item){
					var nodes = tree.get("selectedNodes");
					if(dojo.indexOf(nodes, w) == -1) {
						tree.set("selectedNodes", [w]);
					}
				}
			}});
	},

	destroy: function(){
		this.inherited(arguments);
	},
	
	_dblClick: function(node)
	{
		if (node.elementType=="File")
		{
			davinci.Workbench.openEditor({
				fileName: node,
				content: node.getText()
			});
		}
	},
	
	_getIconClass: function(item, opened){
		if (item.elementType == "Folder"){
			return opened ? "dijitFolderOpened" : "dijitFolderClosed";
		}
		if (item.elementType=="File"){
			var icon;
				fileType=item.getExtension();
				extension=davinci.Runtime.getExtension("davinci.fileType", function (extension){
					return extension.extension==fileType;
				});
			if (extension){
				icon=extension.iconClass;
			}
			return icon || "dijitLeaf";
		}
		return this.prototype.getIconClass(item, opened);
	},

	_getRowClass: function(item) {
		if (item.readOnly()) {
			return "readOnlyResource";
		}
	}
});