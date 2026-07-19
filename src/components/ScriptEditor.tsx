import React, { useState } from "react";
import { Script } from "../lib/types";
import { Code, Play, Trash2, Plus } from "lucide-react";

interface ScriptEditorProps {
  script: Script;
  onChange: (script: Script) => void;
  type: "pre-request" | "post-response";
}

export function ScriptEditor({ script, onChange, type }: ScriptEditorProps) {
  const [source, setSource] = useState(script.source || "");

  const handleToggle = () => {
    onChange({ ...script, enabled: !script.enabled });
  };

  const handleSourceChange = (value: string) => {
    setSource(value);
    onChange({ ...script, source: value });
  };

  const title = type === "pre-request" ? "Pre-request Script" : "Post-response Script";

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</h3>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={script.enabled}
            onChange={handleToggle}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-600 dark:text-gray-400">Enabled</span>
        </label>
      </div>
      <textarea
        value={source}
        onChange={(e) => handleSourceChange(e.target.value)}
        placeholder="// JavaScript code here
// Available objects: request, environment, globals, collection, local
// Helper functions: setHeader(key, value), setVar(key, value), log(message)"
        className="w-full h-32 px-3 py-2 text-sm font-mono bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        disabled={!script.enabled}
      />
      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        <p>Variables are available as: environment.varName, globals.varName, collection.varName, local.varName</p>
      </div>
    </div>
  );
}

interface TestAssertionEditorProps {
  tests: Array<{ id: string; enabled: boolean; expression: string; description?: string }>;
  onChange: (tests: Array<{ id: string; enabled: boolean; expression: string; description?: string }>) => void;
}

export function TestAssertionEditor({ tests, onChange }: TestAssertionEditorProps) {
  const addTest = () => {
    const newTest = {
      id: `test_${Date.now()}`,
      enabled: true,
      expression: "",
      description: "",
    };
    onChange([...tests, newTest]);
  };

  const updateTest = (id: string, updates: Partial<{ enabled: boolean; expression: string; description: string }>) => {
    onChange(tests.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  };

  const removeTest = (id: string) => {
    onChange(tests.filter((t) => t.id !== id));
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Test Assertions</h3>
        </div>
        <button
          onClick={addTest}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Plus className="w-3 h-3" />
          Add Test
        </button>
      </div>
      {tests.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">No test assertions defined</p>
      ) : (
        <div className="space-y-2">
          {tests.map((test) => (
            <div key={test.id} className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
              <input
                type="checkbox"
                checked={test.enabled}
                onChange={(e) => updateTest(test.id, { enabled: e.target.checked })}
                className="w-4 h-4 mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1 space-y-1">
                <input
                  type="text"
                  value={test.expression}
                  onChange={(e) => updateTest(test.id, { expression: e.target.value })}
                  placeholder="e.g., response.status === 200"
                  className="w-full px-2 py-1 text-sm font-mono bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
                  disabled={!test.enabled}
                />
                <input
                  type="text"
                  value={test.description || ""}
                  onChange={(e) => updateTest(test.id, { description: e.target.value })}
                  placeholder="Description (optional)"
                  className="w-full px-2 py-1 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
                  disabled={!test.enabled}
                />
              </div>
              <button
                onClick={() => removeTest(test.id)}
                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        <p>Available in expressions: response.status, response.body, response.headers, response.duration</p>
      </div>
    </div>
  );
}
