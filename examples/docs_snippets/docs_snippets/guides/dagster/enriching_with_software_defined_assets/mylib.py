from typing import Any
from unittest.mock import MagicMock

from pandas import DataFrame

from dagster import InputContext, IOManager, OutputContext, io_manager


def create_db_connection() -> Any:
    return MagicMock()


def train_recommender_model(df: DataFrame) -> Any:
    del df


def pickle_to_s3(object: Any, key: str) -> None:  # noqa: A002
    pass


def fetch_products() -> DataFrame:
    return DataFrame({"product": ["knive"], "category": ["kitchenware"]})


@io_manager
def snowflake_io_manager():
    class SnowflakeIOManager(IOManager):
        def handle_output(self, context: OutputContext, obj):
            del context
            del obj

        def load_input(self, context: InputContext):
            return DataFrame()

    return SnowflakeIOManager()


@io_manager
def s3_io_manager():
    class S3IOManager(IOManager):
        def handle_output(self, context: OutputContext, obj):
            del context
            del obj

        def load_input(self, context: InputContext):
            return None

    return S3IOManager()
