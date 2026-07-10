package com.karibuhealth.app.data.remote.dto

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.nullable
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/**
 * Reads a jsonb column that MAY hold either a JSON string or a real JSON
 * object/array, always yielding the String the rest of the app expects.
 *
 * Why this exists: `provider_notes.structured_data` is jsonb. Android and the
 * web autosave write it as a JSON-encoded STRING (double-encoded), but the AI
 * pipeline and newer web paths write real OBJECTS. The plain String field then
 * exploded on read-back with "Unexpected JSON token … Expected beginning of
 * the string, but got {" — which failed sync entries whose WRITE had already
 * landed (1.0.32 field report, 2026-07-09). Objects/arrays are surfaced as
 * their compact JSON text, which every existing consumer already parses.
 */
object FlexibleJsonString : KSerializer<String?> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("FlexibleJsonString", PrimitiveKind.STRING).nullable

    override fun deserialize(decoder: Decoder): String? {
        val jsonDecoder = decoder as? JsonDecoder
            ?: return decoder.decodeString()
        return when (val element = jsonDecoder.decodeJsonElement()) {
            is JsonNull -> null
            is JsonPrimitive -> if (element.isString) element.content else element.toString()
            else -> element.toString() // JsonObject / JsonArray -> compact JSON text
        }
    }

    override fun serialize(encoder: Encoder, value: String?) {
        if (value == null) encoder.encodeNull() else encoder.encodeString(value)
    }
}
