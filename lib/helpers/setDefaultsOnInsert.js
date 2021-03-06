'use strict';

const modifiedPaths = require('./common').modifiedPaths;

/**
 * Applies defaults to update and findOneAndUpdate operations.
 *
 * @param {Object} filter
 * @param {Schema} schema
 * @param {Object} castedDoc
 * @param {Object} options
 * @method setDefaultsOnInsert
 * @api private
 */

module.exports = function(filter, schema, castedDoc, options) {
  const keys = Object.keys(castedDoc || {});
  const updatedKeys = {};
  const updatedValues = {};
  const numKeys = keys.length;
  const modified = {};

  let hasDollarUpdate = false;

  options = options || {};

  if (!options.upsert || !options.setDefaultsOnInsert) {
    return castedDoc;
  }

  for (let i = 0; i < numKeys; ++i) {
    if (keys[i].charAt(0) === '$') {
      modifiedPaths(castedDoc[keys[i]], '', modified);
      hasDollarUpdate = true;
    }
  }

  if (!hasDollarUpdate) {
    modifiedPaths(castedDoc, '', modified);
  }

  const paths = Object.keys(filter);
  const numPaths = paths.length;
  for (let i = 0; i < numPaths; ++i) {
    const path = paths[i];
    const condition = filter[path];
    if (condition && typeof condition === 'object') {
      const conditionKeys = Object.keys(condition);
      const numConditionKeys = conditionKeys.length;
      let hasDollarKey = false;
      for (let j = 0; j < numConditionKeys; ++j) {
        if (conditionKeys[j].charAt(0) === '$') {
          hasDollarKey = true;
          break;
        }
      }
      if (hasDollarKey) {
        continue;
      }
    }
    updatedKeys[path] = true;
    modified[path] = true;
  }

  if (options && options.overwrite && !hasDollarUpdate) {
    // Defaults will be set later, since we're overwriting we'll cast
    // the whole update to a document
    return castedDoc;
  }

  schema.eachPath(function(path, schemaType) {
    if (schemaType.$isSingleNested) {
      // Only handle nested schemas 1-level deep to avoid infinite
      // recursion re: https://github.com/mongodb-js/mongoose-autopopulate/issues/11
      schemaType.schema.eachPath(function(_path, _schemaType) {
        if (_path === '_id' && _schemaType.auto) {
          // Ignore _id if auto id so we don't create subdocs
          return;
        }

        const def = _schemaType.getDefault(null, true);
        if (!isModified(modified, path + '.' + _path) &&
            typeof def !== 'undefined') {
          castedDoc = castedDoc || {};
          castedDoc.$setOnInsert = castedDoc.$setOnInsert || {};
          castedDoc.$setOnInsert[path + '.' + _path] = def;
          updatedValues[path + '.' + _path] = def;
        }
      });
    } else {
      const def = schemaType.getDefault(null, true);
      if (!isModified(modified, path) && typeof def !== 'undefined') {
        castedDoc = castedDoc || {};
        castedDoc.$setOnInsert = castedDoc.$setOnInsert || {};
        castedDoc.$setOnInsert[path] = def;
        updatedValues[path] = def;
      }
    }
  });

  return castedDoc;
};

function isModified(modified, path) {
  if (modified[path]) {
    return true;
  }
  const sp = path.split('.');
  let cur = sp[0];
  for (let i = 1; i < sp.length; ++i) {
    if (modified[cur]) {
      return true;
    }
    cur += '.' + sp[i];
  }
  return false;
}
