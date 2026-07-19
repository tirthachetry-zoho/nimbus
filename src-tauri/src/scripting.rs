use rquickjs::{Context, Ctx, Function, Runtime, Value};
use std::collections::HashMap;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScriptContext {
    pub request: RequestData,
    pub environment: HashMap<String, String>,
    pub globals: HashMap<String, String>,
    pub collection_vars: HashMap<String, String>,
    pub local_vars: HashMap<String, String>,
    pub response: Option<ResponseData>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RequestData {
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ResponseData {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScriptResult {
    pub modified_headers: HashMap<String, String>,
    pub modified_body: Option<String>,
    pub modified_url: Option<String>,
    pub set_vars: HashMap<String, String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TestAssertion {
    pub id: String,
    pub enabled: bool,
    pub expression: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TestResult {
    pub assertion_id: String,
    pub passed: bool,
    pub error: Option<String>,
}

pub fn execute_script(
    script: &str,
    context: &ScriptContext,
) -> Result<ScriptResult, rquickjs::Error> {
    let rt = Runtime::new()?;
    let ctx = Context::full(&rt)?;

    let result = ctx.with(|ctx| -> Result<ScriptResult, rquickjs::Error> {
        // Create global objects
        let global = ctx.globals();

        // Set up request object
        let request_obj = ctx.eval::<Value, _>("({})".to_string())?;
        if let Some(obj) = request_obj.as_object() {
            obj.set("method", context.request.method.clone())?;
            obj.set("url", context.request.url.clone())?;

            let headers_obj = ctx.eval::<Value, _>("({})".to_string())?;
            if let Some(h) = headers_obj.as_object() {
                for (k, v) in &context.request.headers {
                    h.set(k, v.clone())?;
                }
            }
            obj.set("headers", headers_obj)?;

            if let Some(body) = &context.request.body {
                obj.set("body", body.clone())?;
            }
        }
        global.set("request", request_obj)?;

        // Set up environment variables
        let env_obj = ctx.eval::<Value, _>("({})".to_string())?;
        if let Some(obj) = env_obj.as_object() {
            for (k, v) in &context.environment {
                obj.set(k, v.clone())?;
            }
        }
        global.set("environment", env_obj)?;

        // Set up globals
        let globals_obj = ctx.eval::<Value, _>("({})".to_string())?;
        if let Some(obj) = globals_obj.as_object() {
            for (k, v) in &context.globals {
                obj.set(k, v.clone())?;
            }
        }
        global.set("globals", globals_obj)?;

        // Set up collection vars
        let collection_obj = ctx.eval::<Value, _>("({})".to_string())?;
        if let Some(obj) = collection_obj.as_object() {
            for (k, v) in &context.collection_vars {
                obj.set(k, v.clone())?;
            }
        }
        global.set("collection", collection_obj)?;

        // Set up local vars
        let local_obj = ctx.eval::<Value, _>("({})".to_string())?;
        if let Some(obj) = local_obj.as_object() {
            for (k, v) in &context.local_vars {
                obj.set(k, v.clone())?;
            }
        }
        global.set("local", local_obj)?;

        // Create result tracking objects
        let modified_headers: HashMap<String, String> = HashMap::new();
        let set_vars: HashMap<String, String> = HashMap::new();
        let errors: Vec<String> = Vec::new();

        // Add helper functions
        let set_header_fn =
            Function::new(ctx.clone(), |_ctx: Ctx, _key: String, _value: String| {
                // This would need to be stored externally in a real implementation
                Ok::<(), rquickjs::Error>(())
            })?;
        global.set("setHeader", set_header_fn)?;

        let set_var_fn = Function::new(ctx.clone(), |_ctx: Ctx, _key: String, _value: String| {
            // This would need to be stored externally in a real implementation
            Ok::<(), rquickjs::Error>(())
        })?;
        global.set("setVar", set_var_fn)?;

        let log_fn = Function::new(ctx.clone(), |_ctx: Ctx, msg: String| {
            println!("[Script] {}", msg);
            Ok::<(), rquickjs::Error>(())
        })?;
        global.set("log", log_fn)?;

        // Execute the script
        ctx.eval::<Value, _>(script.to_string())?;

        Ok(ScriptResult {
            modified_headers,
            modified_body: None,
            modified_url: None,
            set_vars,
            errors,
        })
    })?;

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_script() {
        let context = ScriptContext {
            request: RequestData {
                method: "GET".to_string(),
                url: "https://example.com".to_string(),
                headers: HashMap::new(),
                body: None,
            },
            environment: HashMap::new(),
            globals: HashMap::new(),
            collection_vars: HashMap::new(),
            local_vars: HashMap::new(),
            response: None,
        };

        let script = r#"
            log("Test script executed");
        "#;

        let result = execute_script(script, &context);
        assert!(result.is_ok());
    }

    #[test]
    fn test_script_with_variables() {
        let mut context = ScriptContext {
            request: RequestData {
                method: "GET".to_string(),
                url: "https://example.com".to_string(),
                headers: HashMap::new(),
                body: None,
            },
            environment: HashMap::new(),
            globals: HashMap::new(),
            collection_vars: HashMap::new(),
            local_vars: HashMap::new(),
            response: None,
        };

        context
            .environment
            .insert("baseUrl".to_string(), "https://api.example.com".to_string());

        let script = r#"
            log("Base URL: " + environment.baseUrl);
        "#;

        let result = execute_script(script, &context);
        assert!(result.is_ok());
    }

    fn sample_response() -> ResponseData {
        let mut headers = HashMap::new();
        headers.insert("content-type".to_string(), "application/json".to_string());
        ResponseData {
            status: 200,
            status_text: "OK".to_string(),
            headers,
            body: "{\"ok\": true}".to_string(),
            duration_ms: 5,
        }
    }

    #[test]
    fn test_passing_assertion() {
        let assertions = vec![TestAssertion {
            id: "a1".to_string(),
            enabled: true,
            expression: "response.status === 200".to_string(),
            description: Some("status ok".to_string()),
        }];
        let results = execute_test_assertions(&assertions, &sample_response());
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].assertion_id, "a1");
        assert!(results[0].passed);
        assert!(results[0].error.is_none());
    }

    #[test]
    fn test_failing_assertion() {
        let assertions = vec![TestAssertion {
            id: "a2".to_string(),
            enabled: true,
            expression: "response.status === 500".to_string(),
            description: None,
        }];
        let results = execute_test_assertions(&assertions, &sample_response());
        assert_eq!(results.len(), 1);
        assert!(!results[0].passed);
    }

    #[test]
    fn test_disabled_assertion_is_skipped() {
        let assertions = vec![
            TestAssertion {
                id: "a3".to_string(),
                enabled: false,
                expression: "response.status === 200".to_string(),
                description: None,
            },
            TestAssertion {
                id: "a4".to_string(),
                enabled: true,
                expression: "response.status === 200".to_string(),
                description: None,
            },
        ];
        let results = execute_test_assertions(&assertions, &sample_response());
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].assertion_id, "a4");
    }

    #[test]
    fn test_invalid_expression_records_error() {
        let assertions = vec![TestAssertion {
            id: "a5".to_string(),
            enabled: true,
            expression: "this is not valid js ===".to_string(),
            description: None,
        }];
        let results = execute_test_assertions(&assertions, &sample_response());
        assert_eq!(results.len(), 1);
        assert!(!results[0].passed);
        assert!(results[0].error.is_some());
    }

    #[test]
    fn test_empty_assertions_return_empty_results() {
        let results = execute_test_assertions(&[], &sample_response());
        assert!(results.is_empty());
    }
}

pub fn execute_test_assertions(
    assertions: &[TestAssertion],
    response: &ResponseData,
) -> Vec<TestResult> {
    let rt = Runtime::new();
    let ctx = if let Ok(c) = rt.and_then(|r| Context::full(&r)) {
        c
    } else {
        return assertions
            .iter()
            .map(|a| TestResult {
                assertion_id: a.id.clone(),
                passed: false,
                error: Some("Failed to create JS runtime".to_string()),
            })
            .collect();
    };

    let mut results = Vec::new();

    if let Ok(_) = ctx.with(|ctx| -> Result<(), rquickjs::Error> {
        let global = ctx.globals();

        // Set up response object
        let response_obj = ctx.eval::<Value, _>("({})".to_string())?;
        if let Some(obj) = response_obj.as_object() {
            obj.set("status", response.status)?;
            obj.set("statusText", response.status_text.clone())?;

            let headers_obj = ctx.eval::<Value, _>("({})".to_string())?;
            if let Some(h) = headers_obj.as_object() {
                for (k, v) in &response.headers {
                    h.set(k, v.clone())?;
                }
            }
            obj.set("headers", headers_obj)?;
            obj.set("body", response.body.clone())?;
            obj.set("duration", response.duration_ms as f64)?;
        }
        global.set("response", response_obj)?;

        for assertion in assertions {
            if !assertion.enabled {
                continue;
            }

            let result = ctx.eval::<Value, _>(assertion.expression.clone());
            match result {
                Ok(value) => {
                    let passed = value.as_bool().unwrap_or(false);
                    results.push(TestResult {
                        assertion_id: assertion.id.clone(),
                        passed,
                        error: None,
                    });
                }
                Err(e) => {
                    results.push(TestResult {
                        assertion_id: assertion.id.clone(),
                        passed: false,
                        error: Some(format!("Evaluation error: {}", e)),
                    });
                }
            }
        }

        Ok(())
    }) {
        // Context execution succeeded
    } else {
        // Context execution failed
        return assertions
            .iter()
            .map(|a| TestResult {
                assertion_id: a.id.clone(),
                passed: false,
                error: Some("Context execution failed".to_string()),
            })
            .collect();
    }

    results
}
