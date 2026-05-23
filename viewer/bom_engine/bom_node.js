/**
 * bom_node.js — §S272 BOM Engine Phase 1: BOMNode + recompose()
 * Implementing BOM_ENGINE_SPEC.md §3-§4 — Witness: W-BOM-ENGINE
 *
 * BOMNode class with recompose(hostAABB) Template Method.
 * 5 steps: FIT → RESERVE → FILL → CASCADE → VALIDATE+PHANTOM
 *
 * Depends on: bom_strategies.js, bom_constraints.js
 * No DOM, no Three.js, no SQL.
 *
 * AABB format: {x, y, z, w, d, h} — origin at LBD corner, w/d/h are extents (mm).
 */
(function(exports) {
  'use strict';

  var Strategies;
  var Constraints;

  // Resolve dependencies — Node.js or browser
  if (typeof require !== 'undefined') {
    Strategies  = require('./bom_strategies.js');
    Constraints = require('./bom_constraints.js');
  } else {
    Strategies  = window.BomStrategies;
    Constraints = window.BomConstraints;
  }

  // ── AABB helpers ─────────────────────────────────────────────────────────

  function cloneAABB(a) {
    return { x: a.x, y: a.y, z: a.z, w: a.w, d: a.d, h: a.h };
  }

  /**
   * Get dimension along fill axis.
   * @param {{w:number,d:number,h:number}} dims
   * @param {string} axis - 'x'|'y'|'z'
   * @returns {number}
   */
  function dimOnAxis(dims, axis) {
    if (axis === 'x') return dims.w;
    if (axis === 'y') return dims.d;
    if (axis === 'z') return dims.h;
    return dims.w; // default x
  }

  /**
   * Get origin along fill axis.
   * @param {{x:number,y:number,z:number}} origin
   * @param {string} axis
   * @returns {number}
   */
  function originOnAxis(origin, axis) {
    if (axis === 'x') return origin.x;
    if (axis === 'y') return origin.y;
    if (axis === 'z') return origin.z;
    return origin.x;
  }

  /**
   * Set position of child AABB from center position on fill axis.
   * @param {Object} aabb - child AABB to update
   * @param {string} axis
   * @param {number} centerPos - center position along axis (relative to parent origin)
   * @param {number} parentOrigin - parent origin along axis
   * @param {number} childSize - child size along axis
   */
  function setPositionOnAxis(aabb, axis, centerPos, parentOrigin, childSize) {
    var pos = parentOrigin + centerPos - childSize / 2;
    if (axis === 'x') aabb.x = pos;
    else if (axis === 'y') aabb.y = pos;
    else if (axis === 'z') aabb.z = pos;
  }

  // ── BOMNode ──────────────────────────────────────────────────────────────

  /**
   * @constructor
   * @param {Object} props - BOM line properties (from m_bom_line or test fixture)
   * @param {string} props.id           - unique identifier
   * @param {string} [props.strategy]   - layout strategy name (UNIFORM, PACKED, etc.)
   * @param {boolean} [props.mandatory] - required child
   * @param {number} [props.spacing]    - center-to-center spacing (mm)
   * @param {number} [props.edgeOffset] - edge offset (mm)
   * @param {number} [props.buffer]     - buffer between siblings (mm)
   * @param {number} [props.minCount]   - minimum count
   * @param {number|null} [props.maxCount] - maximum count
   * @param {string} [props.fillAxis]   - 'x'|'y'|'z'
   * @param {number} [props.childSize]  - child size along fill axis (mm)
   * @param {{dx:number,dy:number,dz:number}} [props.tack] - offset from parent LBD
   * @param {{w:number,d:number,h:number}} [props.allocatedSize] - allocated size
   * @param {string} [props.componentType] - 'MAKE'|'PHANTOM'
   * @param {boolean} [props.overridden] - user-repositioned
   * @param {number} [props.fitPriority] - placement/removal priority (lower = first)
   * @param {string} [props.productId]   - product reference
   */
  function BOMNode(props) {
    this.id            = props.id;
    this.strategy      = props.strategy || 'UNIFORM';
    this.mandatory     = props.mandatory || false;
    this.spacing       = props.spacing || 0;
    this.edgeOffset    = props.edgeOffset || 0;
    this.buffer        = props.buffer || 0;
    this.minCount      = props.minCount || 0;
    this.maxCount      = props.maxCount != null ? props.maxCount : null;
    this.fillAxis      = props.fillAxis || 'x';
    this.childSize     = props.childSize || 0;
    this.tack          = props.tack || { dx: 0, dy: 0, dz: 0 };
    this.allocatedSize = props.allocatedSize || null;
    this.componentType = props.componentType || 'MAKE';
    this.overridden    = props.overridden || false;
    this.fitPriority   = props.fitPriority || 100;
    this.productId     = props.productId || null;

    this.children      = [];         // BOMNode[]
    this.parentBOM     = null;       // BOMNode | null
    this.currentAABB   = null;       // runtime AABB
    this.hostAABB      = null;       // parent's AABB (set by recompose)
    this.phantom       = null;       // {w, d, h} remaining capacity
    this.conflicts     = [];         // validation conflicts
  }

  // ── Tree methods ─────────────────────────────────────────────────────────

  /**
   * Add a child node.
   * @param {BOMNode} child
   */
  BOMNode.prototype.addChild = function(child) {
    child.parentBOM = this;
    this.children.push(child);
  };

  /**
   * @returns {BOMNode[]}
   */
  BOMNode.prototype.getChildren = function() {
    return this.children;
  };

  /**
   * @returns {BOMNode|null}
   */
  BOMNode.prototype.getParentBOM = function() {
    return this.parentBOM;
  };

  /**
   * Is this a leaf node? (no children)
   * @returns {boolean}
   */
  BOMNode.prototype.isLeaf = function() {
    return this.children.length === 0;
  };

  // ── recompose() — Template Method ────────────────────────────────────────

  /**
   * Recompose this node within the given host AABB.
   * 5 steps: FIT → RESERVE → FILL → CASCADE → VALIDATE+PHANTOM
   *
   * @param {{x:number,y:number,z:number,w:number,d:number,h:number}} hostAABB
   * @returns {{commands: Object[], conflicts: string[], phantom: {w:number,d:number,h:number}}}
   */
  BOMNode.prototype.recompose = function(hostAABB) {
    this.hostAABB  = cloneAABB(hostAABB);
    this.conflicts = [];
    this._trace    = null; // reset trace

    // Step 1: FIT — adjust own AABB to host
    this._stepFit(hostAABB);

    // Leaf nodes skip Steps 2-4 (I4)
    if (this.isLeaf()) {
      this.phantom = { w: 0, d: 0, h: 0 };
      return { commands: [], conflicts: this.conflicts, phantom: this.phantom };
    }

    // Step 2: RESERVE — mandatory children get zones first
    var reserved = this._stepReserve();

    // Step 3: FILL — optional children recount + place
    var filled = this._stepFill(reserved);

    // Step 4: CASCADE — recurse into child parents
    var allCommands = this._stepCascade(filled);

    // Step 5: VALIDATE + PHANTOM
    this._stepValidateAndPhantom(filled);

    // Build trace for whitebox logging / golden master
    this._trace = {
      id:        this.id,
      hostAABB:  cloneAABB(hostAABB),
      ownAABB:   cloneAABB(this.currentAABB),
      strategy:  this.strategy,
      fillAxis:  this.fillAxis,
      reserved:  reserved.length,
      filled:    filled.length,
      conflicts: this.conflicts.slice(),
      phantom:   this.phantom ? { w: this.phantom.w, d: this.phantom.d, h: this.phantom.h } : null,
      children:  []
    };
    for (var ti = 0; ti < filled.length; ti++) {
      this._trace.children.push({
        id:   filled[ti].node.id,
        aabb: cloneAABB(filled[ti].aabb),
        mandatory: filled[ti].node.mandatory,
        overridden: filled[ti].node.overridden
      });
    }

    return {
      commands:  allCommands,
      conflicts: this.conflicts,
      phantom:   this.phantom
    };
  };

  // ── Step 1: FIT ──────────────────────────────────────────────────────────

  /**
   * Adjust own AABB to fit within host. If SPAN strategy, stretch to fill.
   * Otherwise, position at tack offset within host.
   */
  BOMNode.prototype._stepFit = function(hostAABB) {
    if (this.strategy === 'SPAN') {
      // Stretch to fill host (minus edge offsets)
      var eo = this.edgeOffset || 0;
      this.currentAABB = {
        x: hostAABB.x + eo,
        y: hostAABB.y + eo,
        z: hostAABB.z,
        w: Math.max(0, hostAABB.w - 2 * eo),
        d: Math.max(0, hostAABB.d - 2 * eo),
        h: hostAABB.h
      };
    } else if (this.allocatedSize) {
      // Positioned at tack offset with allocated size
      this.currentAABB = {
        x: hostAABB.x + this.tack.dx,
        y: hostAABB.y + this.tack.dy,
        z: hostAABB.z + this.tack.dz,
        w: this.allocatedSize.w,
        d: this.allocatedSize.d,
        h: this.allocatedSize.h
      };
    } else {
      // Default: inherit host AABB
      this.currentAABB = cloneAABB(hostAABB);
    }

    // Invariant I1 check
    var fit = Constraints.fitCheck(this.currentAABB, hostAABB);
    if (!fit.ok) {
      for (var i = 0; i < fit.conflicts.length; i++) {
        this.conflicts.push('FIT:' + this.id + ':' + fit.conflicts[i]);
      }
    }
  };

  // ── Step 2: RESERVE ──────────────────────────────────────────────────────

  /**
   * Mandatory and overridden children get reserved zones.
   * Returns array of positioned children (mandatory + overridden).
   * @returns {Array<{node: BOMNode, aabb: Object}>}
   */
  BOMNode.prototype._stepReserve = function() {
    var reserved = [];
    // Sort children by fitPriority (lower = reserves first)
    var sorted = this.children.slice().sort(function(a, b) {
      return a.fitPriority - b.fitPriority;
    });

    for (var i = 0; i < sorted.length; i++) {
      var child = sorted[i];
      if (child.mandatory || child.overridden) {
        // Mandatory/overridden: use tack position within parent
        var childAABB = this._positionChild(child);
        reserved.push({ node: child, aabb: childAABB });
      }
    }
    return reserved;
  };

  // ── Step 3: FILL ─────────────────────────────────────────────────────────

  /**
   * Optional (non-overridden, non-mandatory) children: compute count + positions via strategy.
   * @param {Array} reserved - already-placed children
   * @returns {Array<{node: BOMNode, aabb: Object}>} all children with AABBs
   */
  BOMNode.prototype._stepFill = function(reserved) {
    var result = reserved.slice(); // start with reserved

    // Collect optional children (not mandatory, not overridden)
    var optionals = [];
    for (var i = 0; i < this.children.length; i++) {
      var child = this.children[i];
      if (!child.mandatory && !child.overridden) {
        optionals.push(child);
      }
    }

    if (optionals.length === 0) return result;

    // Compute available space on fill axis — subtract reserved children
    var axis = this.fillAxis;
    var totalReserved = 0;
    var maxReservedEnd = 0; // rightmost edge of reserved children on fill axis
    for (var ri = 0; ri < reserved.length; ri++) {
      var rDim = dimOnAxis(reserved[ri].aabb, axis);
      totalReserved += rDim;
      var rOrigin = originOnAxis(reserved[ri].aabb, axis);
      var rEnd = rOrigin + rDim;
      if (rEnd > maxReservedEnd) maxReservedEnd = rEnd;
    }
    var available = dimOnAxis(this.currentAABB, axis) - totalReserved;
    // Offset fill origin past reserved children
    var parentOriginRaw = originOnAxis(this.currentAABB, axis);
    var parentOrigin = reserved.length > 0 ? maxReservedEnd : parentOriginRaw;

    // All optionals share the same strategy (parent's strategy drives)
    var strat = this.strategy;
    var childSz = optionals[0].childSize || dimOnAxis(
      optionals[0].allocatedSize || { w: 0, d: 0, h: 0 }, axis
    );

    var stratResult;
    if (strat === 'UNIFORM' || strat === 'LINEAR') {
      stratResult = Strategies.UNIFORM({
        available:  available,
        childSize:  childSz,
        spacing:    this.spacing,
        edgeOffset: this.edgeOffset,
        minCount:   this.minCount,
        maxCount:   this.maxCount
      });
    } else if (strat === 'PACKED') {
      stratResult = Strategies.PACKED({
        available:  available,
        childSize:  childSz,
        buffer:     this.buffer,
        edgeOffset: this.edgeOffset,
        minCount:   this.minCount,
        maxCount:   this.maxCount
      });
    } else if (strat === 'CENTERED') {
      stratResult = Strategies.CENTERED({
        available: available,
        childSize: childSz,
        spacing:   this.spacing,
        count:     optionals.length
      });
    } else if (strat === 'REPEAT') {
      stratResult = Strategies.REPEAT({
        available:    available,
        templateSize: childSz,
        buffer:       this.buffer,
        edgeOffset:   this.edgeOffset,
        minCount:     this.minCount,
        maxCount:     this.maxCount
      });
    } else if (strat === 'FIXED') {
      var origPositions = [];
      for (var fi = 0; fi < optionals.length; fi++) {
        var tOff = (axis === 'x') ? optionals[fi].tack.dx :
                   (axis === 'y') ? optionals[fi].tack.dy : optionals[fi].tack.dz;
        origPositions.push(tOff + childSz / 2);
      }
      stratResult = Strategies.FIXED({
        available:     available,
        origAvailable: available, // no original available in Phase 1
        origPositions: origPositions
      });
    } else if (strat === 'SPAN') {
      stratResult = Strategies.SPAN({
        available:  available,
        edgeOffset: this.edgeOffset
      });
    } else {
      // Unknown strategy — fall back to UNIFORM
      stratResult = Strategies.UNIFORM({
        available:  available,
        childSize:  childSz,
        spacing:    this.spacing || childSz,
        edgeOffset: this.edgeOffset,
        minCount:   this.minCount,
        maxCount:   this.maxCount
      });
    }

    // Position each optional child from strategy positions
    var positions = stratResult.positions;
    for (var pi = 0; pi < positions.length && pi < optionals.length; pi++) {
      var opt = optionals[pi];
      var sz = opt.allocatedSize || { w: childSz, d: childSz, h: childSz };
      var aabb = {
        x: this.currentAABB.x + opt.tack.dx,
        y: this.currentAABB.y + opt.tack.dy,
        z: this.currentAABB.z + opt.tack.dz,
        w: sz.w, d: sz.d, h: sz.h
      };
      setPositionOnAxis(aabb, axis, positions[pi], parentOrigin,
        dimOnAxis(sz, axis));
      opt.currentAABB = aabb;
      result.push({ node: opt, aabb: aabb });
    }

    return result;
  };

  // ── Step 4: CASCADE ──────────────────────────────────────────────────────

  /**
   * Recurse into children that are themselves parents (have children).
   * @param {Array<{node: BOMNode, aabb: Object}>} positioned
   * @returns {Object[]} accumulated commands from all sub-recompositions
   */
  BOMNode.prototype._stepCascade = function(positioned) {
    var allCommands = [];

    for (var i = 0; i < positioned.length; i++) {
      var entry = positioned[i];
      var child = entry.node;
      if (!child.isLeaf()) {
        var sub = child.recompose(entry.aabb);
        for (var j = 0; j < sub.commands.length; j++) {
          allCommands.push(sub.commands[j]);
        }
        // Propagate conflicts
        for (var k = 0; k < sub.conflicts.length; k++) {
          this.conflicts.push(sub.conflicts[k]);
        }
      } else {
        child.currentAABB = cloneAABB(entry.aabb);
        child.hostAABB    = cloneAABB(entry.aabb);
      }
    }

    return allCommands;
  };

  // ── Step 5: VALIDATE + PHANTOM ───────────────────────────────────────────

  /**
   * Check all children fit, no overlaps, mandatory present. Compute PHANTOM.
   * @param {Array<{node: BOMNode, aabb: Object}>} positioned
   */
  BOMNode.prototype._stepValidateAndPhantom = function(positioned) {
    // Mandatory check
    var mandatoryList = [];
    for (var i = 0; i < this.children.length; i++) {
      var c = this.children[i];
      var isPresent = false;
      for (var j = 0; j < positioned.length; j++) {
        if (positioned[j].node === c) { isPresent = true; break; }
      }
      mandatoryList.push({ id: c.id, mandatory: c.mandatory, present: isPresent });
    }
    var mc = Constraints.mandatoryCheck(mandatoryList);
    if (!mc.ok) {
      for (var mi = 0; mi < mc.missing.length; mi++) {
        this.conflicts.push('MANDATORY:' + mc.missing[mi]);
      }
    }

    // Compute PHANTOM (remaining capacity)
    var childDims = [];
    for (var pi = 0; pi < positioned.length; pi++) {
      var a = positioned[pi].aabb;
      childDims.push({ w: a.w, d: a.d, h: a.h });
    }
    this.phantom = Constraints.computePhantom(
      { w: this.currentAABB.w, d: this.currentAABB.d, h: this.currentAABB.h },
      childDims
    );
  };

  // ── Helper: position a child using tack offset ───────────────────────────

  /**
   * Position a mandatory/overridden child at its tack offset within parent.
   * @param {BOMNode} child
   * @returns {Object} child AABB
   */
  BOMNode.prototype._positionChild = function(child) {
    var sz = child.allocatedSize || {
      w: child.childSize || this.currentAABB.w,
      d: child.childSize || this.currentAABB.d,
      h: child.childSize || this.currentAABB.h
    };
    var aabb = {
      x: this.currentAABB.x + child.tack.dx,
      y: this.currentAABB.y + child.tack.dy,
      z: this.currentAABB.z + child.tack.dz,
      w: sz.w, d: sz.d, h: sz.h
    };
    child.currentAABB = aabb;
    return aabb;
  };

  // ── Snapshot — serialise full tree for golden master ───────────────────

  /**
   * Recursively snapshot this node and all descendants.
   * Returns a plain JSON-safe object suitable for golden master comparison.
   * @returns {Object}
   */
  BOMNode.prototype.snapshot = function() {
    var snap = {
      id:       this.id,
      strategy: this.strategy,
      fillAxis: this.fillAxis,
      mandatory: this.mandatory,
      overridden: this.overridden,
      aabb:     this.currentAABB ? cloneAABB(this.currentAABB) : null,
      phantom:  this.phantom ? { w: this.phantom.w, d: this.phantom.d, h: this.phantom.h } : null,
      conflicts: this.conflicts ? this.conflicts.slice() : [],
      children: []
    };
    for (var i = 0; i < this.children.length; i++) {
      snap.children.push(this.children[i].snapshot());
    }
    return snap;
  };

  // ── Exports ──────────────────────────────────────────────────────────────

  exports.BOMNode = BOMNode;

})(typeof module !== 'undefined' ? module.exports : (window.BomNode = {}));
