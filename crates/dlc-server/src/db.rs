use sqlx::sqlite::SqlitePool;
use sqlx::FromRow;

use crate::error::ApiError;

pub async fn fetch_or_not_found<'q, T>(
    query: &'q str,
    id: &'q str,
    db: &SqlitePool,
    entity_name: &str,
) -> Result<T, ApiError>
where
    T: for<'r> FromRow<'r, sqlx::sqlite::SqliteRow> + Send + Unpin,
{
    sqlx::query_as::<_, T>(query)
        .bind(id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| ApiError::not_found(format!("{entity_name} not found")))
}

pub async fn delete_or_not_found(
    query: &str,
    id: &str,
    db: &SqlitePool,
    entity_name: &str,
) -> Result<(), ApiError> {
    let result = sqlx::query(query).bind(id).execute(db).await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::not_found(format!("{entity_name} not found")));
    }
    Ok(())
}

pub fn default_json_array() -> String {
    "[]".to_string()
}
